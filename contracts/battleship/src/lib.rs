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

    /// Create a new game between two players. Returns the game/session ID.
    pub fn new_game(env: Env, player1: Address, player2: Address) -> u32 {
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
            player2: player2.clone(),
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
        };

        env.storage()
            .persistent()
            .set(&DataKey::Game(count), &game);
        env.storage().instance().set(&DataKey::GameCount, &count);

        count
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
        } else if player == game.player2 {
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

        let game_id = client.new_game(&player1, &player2);

        (contract_id, player1, player2, game_id)
    }

    #[test]
    fn test_new_game() {
        let env = Env::default();
        env.mock_all_auths();

        let (contract_id, player1, player2, _) = setup_game(&env);
        let client = BattleshipContractClient::new(&env, &contract_id);

        let game = client.get_game(&1);
        assert_eq!(game.player1, player1);
        assert_eq!(game.player2, player2);
        assert_eq!(game.status, 0);
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
}
