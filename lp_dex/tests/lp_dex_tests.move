#[test_only]
module lp_dex::lp_dex_tests;

use lp_dex::pool::{Self, SUIUSDCPOOL, POOL};
use sui::test_scenario::{Self as test, Scenario, next_tx, ctx};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use usdc::usdc::USDC;
use sui::coin::TreasuryCap;

const ADMIN: address = @0xAD;
const USER1: address = @0x1;
const USER2: address = @0x2;


fun scenario(): Scenario  { test::begin(ADMIN)}


#[test]
fun test_create_pool() {
    let mut scenario = scenario();
    
    // Initialization
    next_tx(&mut scenario, ADMIN);
    {
        pool::init_for_testing(ctx(&mut scenario));
    };
    
    // Create pool
    next_tx(&mut scenario, ADMIN);
    {
        let treasury_cap = test::take_from_sender<TreasuryCap<POOL>>(&scenario);
        let sui_coin = coin::mint_for_testing<SUI>(1000000, ctx(&mut scenario));
        let usdc_coin = coin::mint_for_testing<USDC>(1000000, ctx(&mut scenario));
        
        pool::create_pool(treasury_cap, sui_coin, usdc_coin, ctx(&mut scenario));
    };
    
    // Check pool state
    next_tx(&mut scenario, ADMIN);
    {
        let pool = test::take_shared<SUIUSDCPOOL>(&scenario);
        let (sui_reserve, usdc_reserve, lp_supply) = pool::get_pool_info(&pool);
        
        assert!(sui_reserve == 1000000, 0);
        assert!(usdc_reserve == 1000000, 0);
        assert!(lp_supply == 1000000 - 1000, 1); // Minus locked liquidity
        
        test::return_shared(pool);
    };
    
    scenario.end();
}


#[test]
fun test_add_liquidity() {
    let mut scenario = scenario();

    // Initialization
    next_tx(&mut scenario, ADMIN);
    {
        pool::init_for_testing(ctx(&mut scenario));
    };
    
    // Create pool
    next_tx(&mut scenario, ADMIN);
    {
        let treasury_cap = test::take_from_sender<TreasuryCap<POOL>>(&scenario);
        let sui_coin = coin::mint_for_testing<SUI>(1000000, ctx(&mut scenario));
        let usdc_coin = coin::mint_for_testing<USDC>(1000000, ctx(&mut scenario));
        
        pool::create_pool(treasury_cap, sui_coin, usdc_coin, ctx(&mut scenario));
    };

    // Add liquidity
    next_tx(&mut scenario, USER1);
    {
        let mut lp_pool = test::take_shared<SUIUSDCPOOL>(&scenario);
        let sui_coin = coin::mint_for_testing<SUI>(100000, ctx(&mut scenario));
        let usdc_coin = coin::mint_for_testing<USDC>(100000, ctx( &mut scenario));

        pool::add_liquidity(&mut lp_pool, sui_coin, usdc_coin, 0, ctx(&mut scenario));

        let (sui_reserve, usdc_reserve, _lp_supply) = pool::get_pool_info(&lp_pool);
        assert!(sui_reserve == 1100000, 0);
        assert!(usdc_reserve == 1100000, 0);

        test::return_shared(lp_pool);
    };



    scenario.end();
}

#[test]
fun test_swap_sui_to_usdc() {
    let mut scenario = scenario();

    // Initialization
    next_tx(&mut scenario, ADMIN);
    {
        pool::init_for_testing(ctx(&mut scenario));
    };
    
    // Create pool
    next_tx(&mut scenario, ADMIN);
    {
        let treasury_cap = test::take_from_sender<TreasuryCap<POOL>>(&scenario);
        let sui_coin = coin::mint_for_testing<SUI>(1000000, ctx(&mut scenario));
        let usdc_coin = coin::mint_for_testing<USDC>(1000000, ctx(&mut scenario));
        
        pool::create_pool(treasury_cap, sui_coin, usdc_coin, ctx(&mut scenario));
    };

    // Perform swap
    next_tx(&mut scenario, USER2);
    {
        let mut lp_pool = test::take_shared<SUIUSDCPOOL>(&scenario);
        let sui_coin = coin::mint_for_testing<SUI>(10000, ctx(&mut scenario));

        let expected_usdc = pool::get_usdc_output_amount(&lp_pool, 10000);

        pool::swap_sui_to_usdc(&mut lp_pool, sui_coin, 0, ctx(&mut scenario));
        let (sui_reserve, usdc_reserve, _) = pool::get_pool_info(&lp_pool);


        assert!(sui_reserve == 1009970, 0); // Original + input (10_000 * 99.7%(0.3% fee))
        assert!(usdc_reserve < 1000000, 1); // Should decrease
        assert!(expected_usdc == (1000000 - usdc_reserve), 2); 
        
        test::return_shared(lp_pool);

    };


    scenario.end();
}


#[test]
fun test_swap_usdc_to_sui() {
    let mut scenario = scenario();

    // Initialization
    next_tx(&mut scenario, ADMIN);
    {
        pool::init_for_testing(ctx(&mut scenario));
    };
    
    // Create pool
    next_tx(&mut scenario, ADMIN);
    {
        let treasury_cap = test::take_from_sender<TreasuryCap<POOL>>(&scenario);
        let sui_coin = coin::mint_for_testing<SUI>(1000000, ctx(&mut scenario));
        let usdc_coin = coin::mint_for_testing<USDC>(1000000, ctx(&mut scenario));
        
        pool::create_pool(treasury_cap, sui_coin, usdc_coin, ctx(&mut scenario));
    };

    // Perform swap
    next_tx(&mut scenario, USER2);
    {
        let mut lp_pool = test::take_shared<SUIUSDCPOOL>(&scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(10000, ctx(&mut scenario));

        let expected_sui = pool::get_sui_output_amount(&lp_pool, 10000);

        pool::swap_usdc_to_sui(&mut lp_pool, usdc_coin, 0, ctx(&mut scenario));
        let (sui_reserve, usdc_reserve, _) = pool::get_pool_info(&lp_pool);


        assert!(sui_reserve < 1000000, 0);  // Should decrease 
        assert!(usdc_reserve == 1009970, 1); // Original + input (10_000 * 99.7%(0.3% fee))
        assert!(expected_sui == (1000000 - sui_reserve), 2); 
        
        test::return_shared(lp_pool);

    };


    scenario.end();
}

#[test]
fun test_remove_liquidity() {
    let mut scenario = scenario();

    // Initialization
    next_tx(&mut scenario, ADMIN);
    {
        pool::init_for_testing(ctx(&mut scenario));
    };
    
    // Create pool
    next_tx(&mut scenario, ADMIN);
    {
        let treasury_cap = test::take_from_sender<TreasuryCap<POOL>>(&scenario);
        let sui_coin = coin::mint_for_testing<SUI>(1000000, ctx(&mut scenario));
        let usdc_coin = coin::mint_for_testing<USDC>(1000000, ctx(&mut scenario));
        
        pool::create_pool(treasury_cap, sui_coin, usdc_coin, ctx(&mut scenario));
    };

    next_tx(&mut scenario, ADMIN);
    {
        let mut lp_pool = test::take_shared<SUIUSDCPOOL>(&scenario);
        let lp_tokens = test::take_from_sender<Coin<POOL>>(&scenario);

        let _lp_amount = coin::value(&lp_tokens);

        pool::remove_liquidity(&mut lp_pool, lp_tokens, 0, 0, ctx(&mut scenario));

        let (_sui_reserve, _usdc_reserve, lp_supply) = pool::get_pool_info(&lp_pool);
        assert!(lp_supply == 0, 0); // All LP tokens burned (except locked)


        test::return_shared(lp_pool);
    };

    scenario.end();
}