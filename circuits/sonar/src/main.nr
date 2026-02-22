use std::hash::pedersen_hash;

// Ship lengths: carrier(5), battleship(4), cruiser(3), submarine(3), destroyer(2)
global SHIP_LENGTHS: [u8; 5] = [5, 4, 3, 3, 2];

fn main(
    ships: [Field; 15],
    board_hash: pub Field,
    center_x: pub u8,
    center_y: pub u8,
    count: pub u8
) {
    // Verify ships hash matches board_hash
    let computed_hash = pedersen_hash(ships);
    assert(computed_hash == board_hash);

    // Verify center is within grid bounds
    assert(center_x < 10);
    assert(center_y < 10);

    // Build 10x10 board grid from ships array
    let mut grid: [bool; 100] = [false; 100];

    for i in 0..5 {
        for j in 0..5 {
            if SHIP_LENGTHS[i] > j as u8 {
                let x = ships[i * 3];
                let y = ships[i * 3 + 1];
                let z = ships[i * 3 + 2];

                let mut coord: Field = (x + j as Field) + y * 10;
                if z == 1 {
                    coord = x + (y + j as Field) * 10;
                }

                grid[coord as u32] = true;
            }
        }
    }

    // Count ship cells in 3x3 area around (center_x, center_y), clamped to 0-9
    let min_x: u8 = if center_x > 0 { center_x - 1 } else { 0 };
    let max_x: u8 = if center_x < 9 { center_x + 1 } else { 9 };
    let min_y: u8 = if center_y > 0 { center_y - 1 } else { 0 };
    let max_y: u8 = if center_y < 9 { center_y + 1 } else { 9 };

    let mut ship_count: u8 = 0;

    // Iterate over all possible cells in 3x3 range
    for dy in 0..3 {
        for dx in 0..3 {
            let cx = min_x + dx as u8;
            let cy = min_y + dy as u8;
            if (cx <= max_x) & (cy <= max_y) {
                let idx = cx as Field + cy as Field * 10;
                if grid[idx as u32] {
                    ship_count += 1;
                }
            }
        }
    }

    // Assert count matches claimed count
    assert(ship_count == count);
}

#[test]
fn test_sonar_empty_area() {
    // Ships placed in top rows, sonar on empty bottom-right
    let ships: [Field; 15] = [
        0, 0, 0, // carrier(5) at (0,0) horizontal
        0, 1, 0, // battleship(4) at (0,1) horizontal
        0, 2, 0, // cruiser(3) at (0,2) horizontal
        0, 3, 0, // submarine(3) at (0,3) horizontal
        0, 4, 0  // destroyer(2) at (0,4) horizontal
    ];
    let hash = pedersen_hash(ships);
    main(ships, hash, 8, 8, 0); // Far from all ships → count 0
}

#[test]
fn test_sonar_hits_ships() {
    // Carrier at (0,0) horizontal occupies (0,0)(1,0)(2,0)(3,0)(4,0)
    // Battleship at (0,1) horizontal occupies (0,1)(1,1)(2,1)(3,1)
    // Sonar at (1,0) → 3x3 area is (0-2, 0-1) = 6 cells
    // Ship cells in area: (0,0)(1,0)(2,0) from carrier + (0,1)(1,1)(2,1) from battleship = 6
    let ships: [Field; 15] = [
        0, 0, 0, // carrier(5) at (0,0) horizontal
        0, 1, 0, // battleship(4) at (0,1) horizontal
        0, 2, 0, // cruiser(3) at (0,2) horizontal
        0, 3, 0, // submarine(3) at (0,3) horizontal
        0, 4, 0  // destroyer(2) at (0,4) horizontal
    ];
    let hash = pedersen_hash(ships);
    // Sonar center (1,1): area (0-2, 0-2) = 9 cells
    // (0,0)=ship (1,0)=ship (2,0)=ship (0,1)=ship (1,1)=ship (2,1)=ship (0,2)=ship (1,2)=ship (2,2)=ship = 9
    main(ships, hash, 1, 1, 9);
}

#[test]
fn test_sonar_corner() {
    // Sonar at corner (0,0) → 3x3 clamped to (0-1, 0-1) = 4 cells
    let ships: [Field; 15] = [
        0, 0, 0, // carrier(5) at (0,0) horizontal
        0, 1, 0, // battleship(4) at (0,1) horizontal
        0, 2, 0, // cruiser(3) at (0,2) horizontal
        0, 3, 0, // submarine(3) at (0,3) horizontal
        0, 4, 0  // destroyer(2) at (0,4) horizontal
    ];
    let hash = pedersen_hash(ships);
    // Corner (0,0): area (0-1, 0-1) → (0,0)=ship (1,0)=ship (0,1)=ship (1,1)=ship = 4
    main(ships, hash, 0, 0, 4);
}

#[test]
fn test_sonar_edge() {
    // Sonar at edge (9,5) → 3x3 clamped to (8-9, 4-6) = 6 cells
    let ships: [Field; 15] = [
        0, 0, 0,
        0, 1, 0,
        0, 2, 0,
        0, 3, 0,
        0, 4, 0
    ];
    let hash = pedersen_hash(ships);
    // Edge (9,5): area x=8-9, y=4-6. No ships there → count 0
    main(ships, hash, 9, 5, 0);
}

#[test(should_fail)]
fn test_sonar_wrong_count() {
    let ships: [Field; 15] = [
        0, 0, 0,
        0, 1, 0,
        0, 2, 0,
        0, 3, 0,
        0, 4, 0
    ];
    let hash = pedersen_hash(ships);
    // Claim count 5 at empty area → should fail
    main(ships, hash, 8, 8, 5);
}

#[test(should_fail)]
fn test_sonar_wrong_hash() {
    let ships: [Field; 15] = [
        0, 0, 0,
        0, 1, 0,
        0, 2, 0,
        0, 3, 0,
        0, 4, 0
    ];
    // Wrong hash → should fail
    main(ships, 0, 5, 5, 0);
}

#[test]
fn test_sonar_partial_count() {
    // Mixed layout, sonar should find specific count
    let ships: [Field; 15] = [
        0, 0, 0, // carrier(5) at (0,0) horizontal: (0-4, 0)
        5, 0, 1, // battleship(4) at (5,0) vertical: (5, 0-3)
        6, 0, 1, // cruiser(3) at (6,0) vertical: (6, 0-2)
        0, 5, 0, // submarine(3) at (0,5) horizontal: (0-2, 5)
        7, 7, 1  // destroyer(2) at (7,7) vertical: (7, 7-8)
    ];
    let hash = pedersen_hash(ships);
    // Sonar at (5,1): area (4-6, 0-2) = 9 cells
    // (4,0)=carrier (5,0)=battleship (6,0)=cruiser
    // (4,1)=empty (5,1)=battleship (6,1)=cruiser
    // (4,2)=empty (5,2)=battleship (6,2)=cruiser
    // Count = 3+2+2 = 7
    main(ships, hash, 5, 1, 7);
}
