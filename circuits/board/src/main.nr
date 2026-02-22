use std::hash::pedersen_hash;

// Ship lengths: carrier(5), battleship(4), cruiser(3), submarine(3), destroyer(2)
global SHIP_LENGTHS: [u8; 5] = [5, 4, 3, 3, 2];

fn main(ships: [Field; 15]) -> pub Field {
    // Validate each ship's position is within the 10x10 grid
    for i in 0..5 {
        let x = ships[i * 3] as u8;
        let y = ships[i * 3 + 1] as u8;
        let z = ships[i * 3 + 2] as u8;

        // Orientation must be 0 (horizontal) or 1 (vertical)
        assert(z <= 1);

        if z == 1 {
            // Vertical: x fixed, y extends by ship length
            assert(x < 10);
            assert(y + SHIP_LENGTHS[i] <= 10);
        } else {
            // Horizontal: y fixed, x extends by ship length
            assert(x + SHIP_LENGTHS[i] <= 10);
            assert(y < 10);
        }
    }

    // Check no two ships occupy the same cell
    // Linearize coordinates: coord = x + y * 10 (range 0-99)
    // Sentinel value 100 means "empty slot"
    let mut ship_coords: [Field; 25] = [100; 25];
    let mut collisions: u32 = 0;

    for i in 0..5 {
        for j in 0..5 {
            if SHIP_LENGTHS[i] > j as u8 {
                let x = ships[i * 3];
                let y = ships[i * 3 + 1];
                let z = ships[i * 3 + 2];

                // Compute linearized coordinate for this cell of the ship
                let mut coord = (x + j as Field) + y * 10;
                if z == 1 {
                    coord = x + (y + j as Field) * 10;
                }

                // Check against all previously placed ship cells
                for k in 0..25 {
                    if ship_coords[k] == coord {
                        collisions += 1;
                    }
                }
                ship_coords[i * 5 + j] = coord;
            }
        }
    }
    assert(collisions == 0);

    // Compute and return the board hash
    pedersen_hash(ships)
}

#[test]
fn test_valid_board_horizontal() {
    let ships: [Field; 15] = [
        0, 0, 0, // carrier(5) at (0,0) horizontal
        0, 1, 0, // battleship(4) at (0,1) horizontal
        0, 2, 0, // cruiser(3) at (0,2) horizontal
        0, 3, 0, // submarine(3) at (0,3) horizontal
        0, 4, 0  // destroyer(2) at (0,4) horizontal
    ];
    let hash = main(ships);
    assert(hash == pedersen_hash(ships));
}

#[test]
fn test_valid_board_vertical() {
    let ships: [Field; 15] = [
        0, 0, 1, // carrier(5) at (0,0) vertical
        1, 0, 1, // battleship(4) at (1,0) vertical
        2, 0, 1, // cruiser(3) at (2,0) vertical
        3, 0, 1, // submarine(3) at (3,0) vertical
        4, 0, 1  // destroyer(2) at (4,0) vertical
    ];
    let hash = main(ships);
    assert(hash == pedersen_hash(ships));
}

#[test]
fn test_valid_board_mixed() {
    let ships: [Field; 15] = [
        0, 0, 0, // carrier(5) at (0,0) horizontal: (0-4, 0)
        5, 0, 1, // battleship(4) at (5,0) vertical: (5, 0-3)
        6, 0, 1, // cruiser(3) at (6,0) vertical: (6, 0-2)
        0, 5, 0, // submarine(3) at (0,5) horizontal: (0-2, 5)
        7, 7, 1  // destroyer(2) at (7,7) vertical: (7, 7-8)
    ];
    let _hash = main(ships);
}

#[test(should_fail)]
fn test_out_of_bounds_horizontal() {
    let ships: [Field; 15] = [
        6, 0, 0, // carrier(5) at (6,0) horizontal: extends to x=10, out of bounds!
        0, 1, 0,
        0, 2, 0,
        0, 3, 0,
        0, 4, 0
    ];
    let _hash = main(ships);
}

#[test(should_fail)]
fn test_out_of_bounds_vertical() {
    let ships: [Field; 15] = [
        0, 0, 0,
        0, 1, 0,
        0, 2, 0,
        0, 3, 0,
        0, 9, 1  // destroyer(2) at (0,9) vertical: extends to y=10, out of bounds!
    ];
    let _hash = main(ships);
}

#[test(should_fail)]
fn test_ship_collision() {
    let ships: [Field; 15] = [
        0, 0, 0, // carrier at (0,0) horizontal
        0, 0, 0, // battleship at (0,0) horizontal: overlaps with carrier
        0, 2, 0,
        0, 3, 0,
        0, 4, 0
    ];
    let _hash = main(ships);
}
