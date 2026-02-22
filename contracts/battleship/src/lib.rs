#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, BytesN, Env, IntoVal, Symbol, Val, Vec,
};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    GameCount,
    Hub,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player2: Address,
    pub board_hash1: BytesN<32>,
    pub board_hash2: BytesN<32>,
    pub boards_committed: u32,
    pub turn: u32,       // 1 = player1's turn to shoot, 2 = player2's turn
    pub p1_hits: u32,    // total hits scored by player 1
    pub p2_hits: u32,    // total hits scored by player 2
    pub status: u32,     // 0=created, 1=in_progress, 2=completed
    pub session_id: u32,
    pub awaiting_report: bool,
    pub last_shot_x: u32,
    pub last_shot_y: u32,
    pub p1_turns_taken: u32,
    pub p2_turns_taken: u32,
    pub p1_sonar_used: bool,
    pub p2_sonar_used: bool,
    pub awaiting_sonar: bool,
    pub sonar_center_x: u32,
    pub sonar_center_y: u32,
    pub last_sonar_count: u32,
}

#[contract]
pub struct BattleshipContract;

#[contractimpl]
impl BattleshipContract {
    /// Initialize the contract with the game hub address
    pub fn initialize(env: Env, hub: Address) {
        assert!(
            !env.storage().instance().has(&DataKey::Hub),
            "already initialized"
        );
        env.storage().instance().set(&DataKey::Hub, &hub);
        env.storage().instance().set(&DataKey::GameCount, &0u32);
    }

    /// Create a new game. Player 2 joins later via join_game(). Returns the game/session ID.
    pub fn new_game(env: Env, player1: Address) -> u32 {
        player1.require_auth();

        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::GameCount)
            .unwrap_or(0);
        count += 1;

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        let game = Game {
            player1: player1.clone(),
            player2: player1.clone(), // sentinel: player2 == player1 means "no opponent yet"
            board_hash1: zero_hash.clone(),
            board_hash2: zero_hash,
            boards_committed: 0,
            turn: 1,
            p1_hits: 0,
            p2_hits: 0,
            status: 0,
            session_id: count,
            awaiting_report: false,
            last_shot_x: 0,
            last_shot_y: 0,
            p1_turns_taken: 0,
            p2_turns_taken: 0,
            p1_sonar_used: false,
            p2_sonar_used: false,
            awaiting_sonar: false,
            sonar_center_x: 0,
            sonar_center_y: 0,
            last_sonar_count: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Game(count), &game);
        env.storage().instance().set(&DataKey::GameCount, &count);

        count
    }

    /// Join an existing game as player 2. The game must be in setup phase with no player 2 yet.
    pub fn join_game(env: Env, game_id: u32, player2: Address) {
        player2.require_auth();

        let mut game: Game = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found");
        assert!(game.status == 0, "game not in setup phase");

        assert!(game.player2 == game.player1, "player 2 already joined");
        assert!(player2 != game.player1, "cannot join your own game");

        game.player2 = player2;

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id), &game);
    }

    /// Commit a board hash (Pedersen hash of ship positions).
    /// When both players have committed, the game starts and the hub is notified.
    pub fn commit_board(env: Env, game_id: u32, player: Address, board_hash: BytesN<32>) {
        player.require_auth();

        let mut game: Game = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found");
        assert!(game.status == 0, "game not in setup phase");

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);

        if player == game.player1 {
            assert!(game.board_hash1 == zero_hash, "board already committed");
            game.board_hash1 = board_hash;
        } else if game.player2 != game.player1 && player == game.player2 {
            assert!(game.board_hash2 == zero_hash, "board already committed");
            game.board_hash2 = board_hash;
        } else {
            panic!("not a player in this game");
        }

        game.boards_committed += 1;

        if game.boards_committed == 2 {
            game.status = 1;

            // Notify game hub
            if env.storage().instance().has(&DataKey::Hub) {
                let hub: Address = env.storage().instance().get(&DataKey::Hub).unwrap();
                let game_addr = env.current_contract_address();
                let args: Vec<Val> = Vec::from_array(
                    &env,
                    [
                        game_addr.into_val(&env),
                        game.session_id.into_val(&env),
                        game.player1.clone().into_val(&env),
                        game.player2.clone().into_val(&env),
                        0i128.into_val(&env),
                        0i128.into_val(&env),
                    ],
                );
                env.invoke_contract::<Val>(&hub, &Symbol::new(&env, "start_game"), args);
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id), &game);
    }

    /// Take a shot at the opponent's board. Must be the caller's turn.
    pub fn take_shot(env: Env, game_id: u32, player: Address, x: u32, y: u32) {
        player.require_auth();

        let mut game: Game = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found");
        assert!(game.status == 1, "game not in progress");
        assert!(!game.awaiting_report, "waiting for hit report");
        assert!(x < 10 && y < 10, "shot out of bounds");

        if game.turn == 1 {
            assert!(player == game.player1, "not your turn");
        } else {
            assert!(player == game.player2, "not your turn");
        }

        game.last_shot_x = x;
        game.last_shot_y = y;
        game.awaiting_report = true;

        // Increment turn counter for the shooter
        if game.turn == 1 {
            game.p1_turns_taken += 1;
        } else {
            game.p2_turns_taken += 1;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id), &game);
    }

    /// Report whether the last shot was a hit or miss.
    /// Called by the DEFENDER (the player who was shot at).
    /// In a full ZK version, this would require a proof.
    pub fn report_result(env: Env, game_id: u32, player: Address, hit: bool) {
        player.require_auth();

        let mut game: Game = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found");
        assert!(game.status == 1, "game not in progress");
        assert!(game.awaiting_report, "no shot to report on");

        // The reporting player is the defender (opponent of the shooter)
        if game.turn == 1 {
            // Player 1 shot, so player 2 reports
            assert!(player == game.player2, "wrong player reporting");
            if hit {
                game.p1_hits += 1;
            }
        } else {
            // Player 2 shot, so player 1 reports
            assert!(player == game.player1, "wrong player reporting");
            if hit {
                game.p2_hits += 1;
            }
        }

        game.awaiting_report = false;
        // Swap turns
        game.turn = if game.turn == 1 { 2 } else { 1 };

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id), &game);
    }

    /// Claim victory when you've sunk all opponent ships (17 hits).
    /// Notifies the game hub.
    pub fn claim_victory(env: Env, game_id: u32, player: Address) {
        player.require_auth();

        let mut game: Game = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found");
        assert!(game.status == 1, "game not in progress");

        let player1_won = if player == game.player1 {
            assert!(game.p1_hits >= 17, "not enough hits to win");
            true
        } else if player == game.player2 {
            assert!(game.p2_hits >= 17, "not enough hits to win");
            false
        } else {
            panic!("not a player");
        };

        game.status = 2;

        // Notify game hub
        if env.storage().instance().has(&DataKey::Hub) {
            let hub: Address = env.storage().instance().get(&DataKey::Hub).unwrap();
            let args: Vec<Val> = Vec::from_array(
                &env,
                [
                    game.session_id.into_val(&env),
                    player1_won.into_val(&env),
                ],
            );
            env.invoke_contract::<Val>(&hub, &Symbol::new(&env, "end_game"), args);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id), &game);
    }

    /// Check if sonar is available for a player (every 3 turns, one use per game)
    pub fn sonar_available(env: Env, game_id: u32, player: Address) -> bool {
        let game: Game = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found");

        if game.status != 1 || game.awaiting_report || game.awaiting_sonar {
            return false;
        }

        if player == game.player1 {
            if game.turn != 1 || game.p1_sonar_used {
                return false;
            }
            game.p1_turns_taken >= 3
        } else if player == game.player2 {
            if game.turn != 2 || game.p2_sonar_used {
                return false;
            }
            game.p2_turns_taken >= 3
        } else {
            false
        }
    }

    /// Use sonar instead of firing a shot. Consumes the turn.
    pub fn use_sonar(env: Env, game_id: u32, player: Address, center_x: u32, center_y: u32) {
        player.require_auth();

        let mut game: Game = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found");
        assert!(game.status == 1, "game not in progress");
        assert!(!game.awaiting_report, "waiting for hit report");
        assert!(!game.awaiting_sonar, "waiting for sonar report");
        assert!(center_x < 10 && center_y < 10, "sonar out of bounds");

        if game.turn == 1 {
            assert!(player == game.player1, "not your turn");
            assert!(!game.p1_sonar_used, "sonar already used");
            assert!(
                game.p1_turns_taken >= 3,
                "sonar not available this turn"
            );
            game.p1_sonar_used = true;
            game.p1_turns_taken += 1;
        } else {
            assert!(player == game.player2, "not your turn");
            assert!(!game.p2_sonar_used, "sonar already used");
            assert!(
                game.p2_turns_taken >= 3,
                "sonar not available this turn"
            );
            game.p2_sonar_used = true;
            game.p2_turns_taken += 1;
        }

        game.sonar_center_x = center_x;
        game.sonar_center_y = center_y;
        game.awaiting_sonar = true;

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id), &game);
    }

    /// Report sonar result — opponent reports count of ship cells in 3x3 area.
    pub fn report_sonar(env: Env, game_id: u32, player: Address, count: u32) {
        player.require_auth();

        let mut game: Game = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found");
        assert!(game.status == 1, "game not in progress");
        assert!(game.awaiting_sonar, "no sonar to report on");
        assert!(count <= 9, "invalid sonar count");

        // The reporting player is the defender (opponent of the sonar user)
        if game.turn == 1 {
            assert!(player == game.player2, "wrong player reporting");
        } else {
            assert!(player == game.player1, "wrong player reporting");
        }

        game.last_sonar_count = count;
        game.awaiting_sonar = false;
        // Swap turns
        game.turn = if game.turn == 1 { 2 } else { 1 };

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id), &game);
    }

    /// Get game state (view function)
    pub fn get_game(env: Env, game_id: u32) -> Game {
        env.storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .expect("game not found")
    }

    /// Get total number of games created
    pub fn game_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::GameCount)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup_game(env: &Env) -> (Address, Address, Address, u32) {
        let contract_id = env.register(BattleshipContract, ());
        let client = BattleshipContractClient::new(env, &contract_id);

        let player1 = Address::generate(env);
        let player2 = Address::generate(env);

        let game_id = client.new_game(&player1);
        client.join_game(&game_id, &player2);

        (contract_id, player1, player2, game_id)
    }

    #[test]
    fn test_new_game() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(BattleshipContract, ());
        let client = BattleshipContractClient::new(&env, &contract_id);

        let player1 = Address::generate(&env);
        let player2 = Address::generate(&env);

        let game_id = client.new_game(&player1);
        let game = client.get_game(&game_id);
        assert_eq!(game.player1, player1);
        assert_eq!(game.status, 0);

        // Player 2 joins
        client.join_game(&game_id, &player2);
        let game = client.get_game(&game_id);
        assert_eq!(game.player2, player2);
    }

    #[test]
    fn test_commit_boards() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);

        client.commit_board(&game_id, &player1, &hash1);
        let game = client.get_game(&game_id);
        assert_eq!(game.boards_committed, 1);
        assert_eq!(game.status, 0);

        // Second board commit - no hub set, so it just updates status
        client.commit_board(&game_id, &player2, &hash2);
        let game = client.get_game(&game_id);
        assert_eq!(game.boards_committed, 2);
        assert_eq!(game.status, 1);
    }

    #[test]
    fn test_take_shot_and_report() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_board(&game_id, &player1, &hash1);
        client.commit_board(&game_id, &player2, &hash2);

        // Player 1 shoots
        client.take_shot(&game_id, &player1, &3, &4);
        let game = client.get_game(&game_id);
        assert_eq!(game.last_shot_x, 3);
        assert_eq!(game.last_shot_y, 4);
        assert!(game.awaiting_report);

        // Player 2 reports hit
        client.report_result(&game_id, &player2, &true);
        let game = client.get_game(&game_id);
        assert_eq!(game.p1_hits, 1);
        assert_eq!(game.turn, 2); // Now player 2's turn
        assert!(!game.awaiting_report);

        // Player 2 shoots
        client.take_shot(&game_id, &player2, &5, &6);

        // Player 1 reports miss
        client.report_result(&game_id, &player1, &false);
        let game = client.get_game(&game_id);
        assert_eq!(game.p2_hits, 0);
        assert_eq!(game.turn, 1); // Back to player 1
    }

    #[test]
    fn test_full_game_to_victory() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_board(&game_id, &player1, &hash1);
        client.commit_board(&game_id, &player2, &hash2);

        // Simulate 17 hits by player 1 (all ships sunk)
        for i in 0..17u32 {
            // Player 1 shoots
            client.take_shot(&game_id, &player1, &(i % 10), &(i / 10));
            // Player 2 reports hit
            client.report_result(&game_id, &player2, &true);

            // Player 2 shoots (misses)
            client.take_shot(&game_id, &player2, &9, &9);
            // Player 1 reports miss
            client.report_result(&game_id, &player1, &false);
        }

        let game = client.get_game(&game_id);
        assert_eq!(game.p1_hits, 17);

        // Player 1 claims victory
        client.claim_victory(&game_id, &player1);
        let game = client.get_game(&game_id);
        assert_eq!(game.status, 2);
    }

    #[test]
    #[should_panic(expected = "not your turn")]
    fn test_wrong_turn() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_board(&game_id, &player1, &hash1);
        client.commit_board(&game_id, &player2, &hash2);

        // Player 2 tries to shoot on player 1's turn
        client.take_shot(&game_id, &player2, &0, &0);
    }

    #[test]
    #[should_panic(expected = "not enough hits")]
    fn test_premature_victory_claim() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_board(&game_id, &player1, &hash1);
        client.commit_board(&game_id, &player2, &hash2);

        // Try to claim victory with 0 hits
        client.claim_victory(&game_id, &player1);
    }

    fn start_game_and_play_turns(
        client: &BattleshipContractClient,
        game_id: &u32,
        player1: &Address,
        player2: &Address,
        turns: u32,
    ) {
        // Play `turns` rounds (each round = p1 shoots + p2 shoots)
        for i in 0..turns {
            client.take_shot(game_id, player1, &(i % 10), &(i / 10));
            client.report_result(game_id, player2, &false);
            client.take_shot(game_id, player2, &(i % 10), &(i / 10));
            client.report_result(game_id, player1, &false);
        }
    }

    #[test]
    fn test_sonar_available_after_3_turns() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_board(&game_id, &player1, &hash1);
        client.commit_board(&game_id, &player2, &hash2);

        // Sonar not available at turn 0
        assert!(!client.sonar_available(&game_id, &player1));

        // Play 3 rounds
        start_game_and_play_turns(&client, &game_id, &player1, &player2, 3);

        // Now it's player 1's turn with 3 turns taken → sonar available
        assert!(client.sonar_available(&game_id, &player1));
    }

    #[test]
    fn test_sonar_full_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_board(&game_id, &player1, &hash1);
        client.commit_board(&game_id, &player2, &hash2);

        // Play 3 rounds so p1 has 3 turns
        start_game_and_play_turns(&client, &game_id, &player1, &player2, 3);

        // Player 1 uses sonar
        client.use_sonar(&game_id, &player1, &5, &5);
        let game = client.get_game(&game_id);
        assert!(game.awaiting_sonar);
        assert_eq!(game.sonar_center_x, 5);
        assert_eq!(game.sonar_center_y, 5);

        // Player 2 reports sonar count
        client.report_sonar(&game_id, &player2, &3);
        let game = client.get_game(&game_id);
        assert!(!game.awaiting_sonar);
        assert_eq!(game.last_sonar_count, 3);
        assert_eq!(game.turn, 2); // Turn swapped to player 2
        assert!(game.p1_sonar_used); // Can't use again
    }

    #[test]
    #[should_panic(expected = "sonar not available this turn")]
    fn test_sonar_too_early() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_board(&game_id, &player1, &hash1);
        client.commit_board(&game_id, &player2, &hash2);

        // Try sonar at turn 0 — should fail
        client.use_sonar(&game_id, &player1, &5, &5);
    }

    #[test]
    #[should_panic(expected = "sonar already used")]
    fn test_sonar_double_use() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, game_id) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let hash1 = BytesN::from_array(&env, &[1u8; 32]);
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_board(&game_id, &player1, &hash1);
        client.commit_board(&game_id, &player2, &hash2);

        // Play 3 rounds, use sonar
        start_game_and_play_turns(&client, &game_id, &player1, &player2, 3);
        // p1_turns=3, turn=1 → sonar available
        client.use_sonar(&game_id, &player1, &5, &5);
        client.report_sonar(&game_id, &player2, &2);
        // p1_turns=4, p1_sonar_used=true, turn=2

        // Get back to p1's turn: p2 shoots, p1 reports
        client.take_shot(&game_id, &player2, &8, &8);
        client.report_result(&game_id, &player1, &false);
        // turn=1, p1_turns=4

        // Try sonar again — should fail with "sonar already used"
        client.use_sonar(&game_id, &player1, &3, &3);
    }
}
