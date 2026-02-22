use std::hash::pedersen_hash;

// Ship lengths: carrier(5), battleship(4), cruiser(3), submarine(3), destroyer(2)
global SHIP_LENGTHS: [u8; 5] = [5, 4, 3, 3, 2];

fn check_hit(ships: [Field; 15], shot_x: Field, shot_y: Field) -> bool {
    let target = shot_x + shot_y * 10;
    let mut hit = false;

    for i in 0..5 {
        for j in 0..5 {
            if SHIP_LENGTHS[i] > j as u8 {
                let x = ships[i * 3];
                let y = ships[i * 3 + 1];
                let z = ships[i * 3 + 2];

                let mut coord = (x + j as Field) + y * 10;
                if z == 1 {
                    coord = x + (y + j as Field) * 10;
                }

                if coord == target {
                    hit = true;
                }
            }
        }
    }
    hit
}

fn main(
    hash: pub Field,
    hit: pub Field,
    ships: [Field; 15],
    shot_x: pub Field,
    shot_y: pub Field
) {
    // Verify board hash matches ship positions
    let computed_hash = pedersen_hash(ships);
    assert(hash == computed_hash);

    // Verify shot is within 10x10 grid
    assert(shot_x as u8 < 10);
    assert(shot_y as u8 < 10);

    // Verify hit is binary (0 or 1)
    assert(hit * (hit - 1) == 0);

    // Check if shot actually hits a ship and verify against claimed result
    let is_hit = check_hit(ships, shot_x, shot_y);
    assert(hit == is_hit as Field);
}

#[test]
fn test_hit_at_origin() {
    let ships: [Field; 15] = [
        0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0
    ];
    let hash = pedersen_hash(ships);
    main(hash, 1, ships, 0, 0); // (0,0) is a hit: carrier starts there
}

#[test]
fn test_hit_middle_of_ship() {
    let ships: [Field; 15] = [
        0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0
    ];
    let hash = pedersen_hash(ships);
    main(hash, 1, ships, 3, 0); // (3,0) is a hit: carrier occupies (0-4, 0)
}

#[test]
fn test_miss() {
    let ships: [Field; 15] = [
        0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0
    ];
    let hash = pedersen_hash(ships);
    main(hash, 0, ships, 5, 5); // (5,5) is a miss
}

#[test]
fn test_hit_vertical_ship() {
    let ships: [Field; 15] = [
        0, 0, 1, // carrier(5) at (0,0) vertical: (0, 0-4)
        1, 0, 1, // battleship(4) at (1,0) vertical
        2, 0, 1, // cruiser(3) at (2,0) vertical
        3, 0, 1, // submarine(3) at (3,0) vertical
        4, 0, 1  // destroyer(2) at (4,0) vertical
    ];
    let hash = pedersen_hash(ships);
    main(hash, 1, ships, 0, 3); // (0,3) is a hit: carrier occupies (0, 0-4)
}

#[test(should_fail)]
fn test_false_hit_claim() {
    let ships: [Field; 15] = [
        0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0
    ];
    let hash = pedersen_hash(ships);
    main(hash, 1, ships, 5, 5); // Claiming hit at empty cell: should fail
}

#[test(should_fail)]
fn test_false_miss_claim() {
    let ships: [Field; 15] = [
        0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0
    ];
    let hash = pedersen_hash(ships);
    main(hash, 0, ships, 0, 0); // Claiming miss at (0,0) which is a hit: should fail
}

#[test(should_fail)]
fn test_wrong_hash() {
    let ships: [Field; 15] = [
        0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0
    ];
    main(0, 0, ships, 5, 5); // Wrong hash: should fail
}
