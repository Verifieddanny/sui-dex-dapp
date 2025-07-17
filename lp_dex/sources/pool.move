module lp_dex::pool;

use sui::coin::{Self, Coin};
use sui::balance::{Self, Balance};
use std::u64::{sqrt, min};
use sui::sui::SUI;
use usdc::usdc::USDC;
use sui::coin::TreasuryCap;
use sui::event;

// ========== ERROR CODES ==========

/// When trying to operate with zero amounts
const EZeroAmount: u64 = 0;
/// When there's insufficient liquidity for an operation
const EInsufficientLiquidity: u64 = 1;
/// When the constant product invariant is violated
const EInvalidK: u64 = 2;
/// When slippage tolerance is exceeded
const ESlippageExceeded: u64 = 3;

// ========== CONSTANTS ==========
    
/// Fee: 0.3% (3/1000) - standard AMM fee
const FEE_NUMERATOR: u64 = 3;
const FEE_DENOMINATOR: u64 = 1000;

/// Minimum liquidity locked forever to prevent division by zero
const MINIMUM_LIQUIDITY: u64 = 1000;

// ========== TYPE DEFINITIONS ==========

/// One-time witness for creating LP token supply
public struct POOL has drop {}

/// The main pool struct holding all reserves and LP token authority
public struct SUIUSDCPOOL has key {
    id: UID,
    sui_reserve: Balance<SUI>,
    usdc_reserve: Balance<USDC>,
    lp_treasury: TreasuryCap<POOL>,
    fee_sui: Balance<SUI>,
    fee_usdc: Balance<USDC>,
}

// ========== EVENTS ==========

/// Emitted when pool is created
public struct PoolCreated has copy, drop {
    pool_id: ID,
    creator: address,
    initial_sui: u64,
    initial_usdc: u64,
    lp_tokens_minted: u64,
}

/// Emitted when liquiduty is added 
public struct LiquidityAdded has copy, drop {
    pool_id: ID,
    provider: address,
    sui_amount: u64,
    usdc_amount: u64,
    lp_tokens_minted: u64
}

/// Emitted when liquidity is removed
public struct LiquidityRemoved has copy, drop {
    pool_id: ID,
    provider: address,
    sui_amount: u64,
    usdc_amount: u64,
    lp_tokens_burned: u64,
}
    
/// Emitted when a swap occurs
public struct SwapExecuted has copy, drop {
    pool_id: ID,
    trader: address,
    sui_in: u64,
    usdc_in: u64,
    sui_out: u64,
    usdc_out: u64,
    fee_amount: u64,
}



// ========== INITIALIZATION ==========
fun init(witness: POOL, ctx: &mut TxContext) {
    let (treasury_cap, metadata) = coin::create_currency<POOL>(
        witness,
        0,
        b"SUDC-LP",
        b"SUI-USDC Liquidity Provider Token",
        b"Represents proportional ownership in SUI-USDC liquidity pool",
        option::none(),
        ctx
    );
    transfer::public_freeze_object(metadata);
    // transfer::public_share_object(treasury_cap);
    transfer::public_transfer(treasury_cap, ctx.sender())
}

// ========== POOL CREATION ==========
/// Creates a new SUI-USDC liquidity pool
/// 
/// # Arguments
/// * `treasury_cap` - Treasury capability for minting LP tokens
/// * `initial_sui` - Initial SUI to deposit
/// * `initial_usdc` - Initial USDC to deposit
/// * `ctx` - Transaction context
#[allow(lint(self_transfer))]
public fun create_pool(
    treasury_cap: TreasuryCap<POOL>,
    initial_sui: Coin<SUI>,
    initial_usdc: Coin<USDC>,
    ctx: &mut TxContext
) {
    let sui_amount = coin::value(&initial_sui);
    let usdc_amount = coin::value(&initial_usdc);
    
    assert!(sui_amount > 0 && usdc_amount > 0, EZeroAmount);
    
    let initial_lp_amount = sqrt(sui_amount * usdc_amount);
    assert!(initial_lp_amount > MINIMUM_LIQUIDITY, EInsufficientLiquidity);
    
    let mut pool = SUIUSDCPOOL {
        id: object::new(ctx),
        sui_reserve: coin::into_balance(initial_sui),
        usdc_reserve: coin::into_balance(initial_usdc),
        lp_treasury: treasury_cap,
        fee_sui: balance::zero<SUI>(),
        fee_usdc: balance::zero<USDC>(),
    };
    
    let pool_id = object::id(&pool);
    let lp_tokens_to_mint = initial_lp_amount - MINIMUM_LIQUIDITY;
    
    // Mint and burn minimum liquidity (locks it forever)
    let minimum_lp = coin::mint(&mut pool.lp_treasury, MINIMUM_LIQUIDITY, ctx);
    coin::burn(&mut pool.lp_treasury, minimum_lp);
    
    // Mint LP tokens for the creator
    let creator_lp_tokens = coin::mint(&mut pool.lp_treasury, lp_tokens_to_mint, ctx);
    
    event::emit(PoolCreated {
        pool_id,
        creator: tx_context::sender(ctx),
        initial_sui: sui_amount,
        initial_usdc: usdc_amount,
        lp_tokens_minted: lp_tokens_to_mint,
    });
    
    transfer::share_object(pool);
    transfer::public_transfer(creator_lp_tokens, tx_context::sender(ctx));
}


// ========== LIQUIDITY MANAGEMENT ==========
    
// Add liquidity to the pool
// 
// # Arguments
// * `pool` - Mutable reference to the pool
// * `sui` - SUI coins to add
// * `usdc` - USDC coins to add  
// * `min_lp_out` - Minimum LP tokens expected (slippage protection)
// * `ctx` - Transaction context

#[allow(lint(self_transfer))]
public fun add_liquidity(
    pool: &mut SUIUSDCPOOL,
    sui: Coin<SUI>,
    usdc: Coin<USDC>,
    min_lp_out: u64,
    ctx: &mut TxContext
) {
    let sui_amount = coin::value(&sui);
    let usdc_amount = coin::value(&usdc);

    assert!(sui_amount > 0 && usdc_amount > 0, EZeroAmount);

    let sui_reserve = balance::value(&pool.sui_reserve);
    let usdc_reserve = balance::value(&pool.usdc_reserve);
    let total_lp_supply = coin::total_supply(&pool.lp_treasury);

    let lp_tokens_to_mint: u64;

    if (total_lp_supply == 0) {
        lp_tokens_to_mint = sqrt(sui_amount * usdc_amount);
    } else {
        let sui_lp_ratio = (sui_amount * total_lp_supply) / sui_reserve;
        let usdc_lp_ratio = (usdc_amount * total_lp_supply) / usdc_reserve;

        lp_tokens_to_mint = min(sui_lp_ratio, usdc_lp_ratio);
    };

    assert!(lp_tokens_to_mint >= min_lp_out, ESlippageExceeded);

    balance::join(&mut pool.sui_reserve, coin::into_balance(sui));
    balance::join(&mut pool.usdc_reserve, coin::into_balance(usdc));

    let lp_tokens = coin::mint(&mut pool.lp_treasury, lp_tokens_to_mint, ctx);

    event::emit(LiquidityAdded {
        pool_id: object::id(pool),
        provider: tx_context::sender(ctx),
        sui_amount,
        usdc_amount,
        lp_tokens_minted: lp_tokens_to_mint,
    });

    transfer::public_transfer(lp_tokens, tx_context::sender(ctx))

}


// Remove liquidity from the pool
// 
// # Arguments
// * `pool` - Mutable reference to the pool
// * `lp_tokens` - LP tokens to burn
// * `min_sui_out` - Minimum SUI expected
// * `min_usdc_out` - Minimum USDC expected
// * `ctx` - Transaction context

#[allow(lint(self_transfer))]
public fun remove_liquidity(
    pool: &mut SUIUSDCPOOL,
    lp_tokens: Coin<POOL>,
    min_sui_out: u64,
    min_usdc_out: u64,
    ctx: &mut TxContext
) {
    let lp_amount = coin::value(&lp_tokens);
    assert!(lp_amount > 0, EZeroAmount);

    let sui_reserve = balance::value(&pool.sui_reserve);
    let usdc_reserve = balance::value(&pool.usdc_reserve);
    let total_lp_supply = coin::total_supply(&pool.lp_treasury);

    let sui_to_return = (lp_amount * sui_reserve) / total_lp_supply;
    let usdc_to_return = (lp_amount * usdc_reserve) / total_lp_supply;

    assert!(sui_to_return >= min_sui_out, ESlippageExceeded);
    assert!(usdc_to_return >= min_usdc_out, ESlippageExceeded);

    coin::burn(&mut pool.lp_treasury, lp_tokens);

    let sui_coin = coin::from_balance(balance::split(&mut pool.sui_reserve, sui_to_return), ctx);
    let usdc_coin = coin::from_balance(balance::split(&mut pool.usdc_reserve, usdc_to_return), ctx);

    event::emit(LiquidityRemoved {
        pool_id: object::id(pool),
        provider: tx_context::sender(ctx),
        sui_amount: sui_to_return,
        usdc_amount: usdc_to_return,
        lp_tokens_burned: lp_amount,
    });

    let sender = tx_context::sender(ctx);
    transfer::public_transfer(sui_coin, sender);
    transfer::public_transfer(usdc_coin, sender)

}


// ========== SWAPPING FUNCTIONS ==========

// Swap SUI for USDC
// 
// Uses the constant product formula: x * y = k
// With fee: output = (input * 997 * reserve_out) / (reserve_in * 1000 + input * 997)
// 
// # Arguments
// * `pool` - Mutable reference to the pool
// * `sui_in` - SUI coins to swap
// * `min_usdc_out` - Minimum USDC expected (slippage protection)
// * `ctx` - Transaction context

#[allow(lint(self_transfer))]
public fun swap_sui_to_usdc(
    pool: &mut SUIUSDCPOOL,
    sui_in: Coin<SUI>,
    min_usdc_out: u64,
    ctx: &mut TxContext
) {
    let sui_amount = coin::value(&sui_in);
    assert!(sui_amount > 0, EZeroAmount);

    let sui_reserve = balance::value(&pool.sui_reserve);
    let usdc_reserve = balance::value(&pool.usdc_reserve);


    let sui_amount_with_fee = sui_amount * (FEE_DENOMINATOR - FEE_NUMERATOR);
    let numerator = sui_amount_with_fee * usdc_reserve;
    let denominator = (sui_reserve * FEE_DENOMINATOR) + sui_amount_with_fee;
    let usdc_out = numerator /denominator;

    assert!(usdc_out >= min_usdc_out, ESlippageExceeded);

    let fee_amount = (sui_amount * FEE_NUMERATOR) / FEE_DENOMINATOR;


    let new_sui_reserve = sui_reserve  + sui_amount;
    let new_usdc_reserve = usdc_reserve - usdc_out;
    assert!((new_sui_reserve * new_usdc_reserve) >= (sui_reserve * usdc_reserve), EInvalidK);

    balance::join(&mut pool.sui_reserve, coin::into_balance(sui_in));

    let fee_balance = balance::split(&mut pool.sui_reserve, fee_amount);
    balance::join(&mut pool.fee_sui, fee_balance);

    let usdc_coin = coin::from_balance(balance::split(&mut pool.usdc_reserve, usdc_out), ctx);

    event::emit(SwapExecuted {
        pool_id: object::id(pool),
        trader: tx_context::sender(ctx),
        sui_in: sui_amount,
        usdc_in: 0,
        sui_out: 0,
        usdc_out,
        fee_amount,
    });

    transfer::public_transfer(usdc_coin, tx_context::sender(ctx));
}

// Swap USDC for SUI
// 
// # Arguments
// * `pool` - Mutable reference to the pool
// * `usdc_in` - USDC coins to swap
// * `min_sui_out` - Minimum SUI expected (slippage protection)
// * `ctx` - Transaction context

#[allow(lint(self_transfer))]
public fun swap_usdc_to_sui(
    pool: &mut SUIUSDCPOOL,
    usdc_in: Coin<USDC>,
    min_sui_out: u64,
    ctx: &mut TxContext
) {
    let usdc_amount = coin::value(&usdc_in);
    assert!(usdc_amount > 0, EZeroAmount);
    
    let sui_reserve = balance::value(&pool.sui_reserve);
    let usdc_reserve = balance::value(&pool.usdc_reserve);
    
    let usdc_amount_with_fee = usdc_amount * (FEE_DENOMINATOR - FEE_NUMERATOR);
    let numerator = usdc_amount_with_fee * sui_reserve;
    let denominator = (usdc_reserve * FEE_DENOMINATOR) + usdc_amount_with_fee;
    let sui_out = numerator / denominator;
    
    assert!(sui_out >= min_sui_out, ESlippageExceeded);
    
    // Calculate fee (in USDC)
    let fee_amount = (usdc_amount * FEE_NUMERATOR) / FEE_DENOMINATOR;

    let new_usdc_reserve = usdc_reserve + usdc_amount;
    let new_sui_reserve = sui_reserve - sui_out;
    assert!(
        new_usdc_reserve * new_sui_reserve >= usdc_reserve * sui_reserve,
        EInvalidK
    );

    balance::join(&mut pool.usdc_reserve, coin::into_balance(usdc_in));
        
    let fee_balance = balance::split(&mut pool.usdc_reserve, fee_amount);
    balance::join(&mut pool.fee_usdc, fee_balance);
    
    let sui_coin = coin::from_balance(
        balance::split(&mut pool.sui_reserve, sui_out),
        ctx
    );
    
    event::emit(SwapExecuted {
        pool_id: object::id(pool),
        trader: tx_context::sender(ctx),
        sui_in: 0,
        usdc_in: usdc_amount,
        sui_out,
        usdc_out: 0,
        fee_amount,
    });
    
    transfer::public_transfer(sui_coin, tx_context::sender(ctx));
}


// ========== VIEW FUNCTIONS ==========

// Get current pool reserves and LP token supply
// 
// # Returns
// * (sui_reserve, usdc_reserve, lp_supply)

public fun get_pool_info(pool: &SUIUSDCPOOL): (u64, u64, u64) {
    (
        balance::value(&pool.sui_reserve),
        balance::value(&pool.usdc_reserve),
        coin::total_supply(&pool.lp_treasury)
    )
}

// Calculate expected USDC output for SUI input (including fee)
// 
// # Arguments
// * `pool` - Pool reference
// * `sui_in` - Amount of SUI to swap
// 
// # Returns
// * Expected USDC output

public fun get_usdc_output_amount(pool: &SUIUSDCPOOL, sui_in: u64): u64 {
    let sui_reserve = balance::value(&pool.sui_reserve);
    let usdc_reserve = balance::value(&pool.usdc_reserve);

    if (sui_in == 0 || sui_reserve == 0 || usdc_reserve == 0) {
        return 0
    };

    let sui_amount_with_fee = sui_in * (FEE_DENOMINATOR - FEE_NUMERATOR);
    let numerator = sui_amount_with_fee * usdc_reserve;
    let denominator = (sui_reserve * FEE_DENOMINATOR) + sui_amount_with_fee;
    
    numerator / denominator
}

// Calculate expected SUI output for USDC input (including fee)
// 
// # Arguments
// * `pool` - Pool reference
// * `usdc_in` - Amount of USDC to swap
// 
// # Returns
// * Expected SUI output
public fun get_sui_output_amount(pool: &SUIUSDCPOOL, usdc_in: u64): u64 {
    let sui_reserve = balance::value(&pool.sui_reserve);
    let usdc_reserve = balance::value(&pool.usdc_reserve);
    
    if (usdc_in == 0 || sui_reserve == 0 || usdc_reserve == 0) {
        return 0
    };
    
    let usdc_amount_with_fee = usdc_in * (FEE_DENOMINATOR - FEE_NUMERATOR);
    let numerator = usdc_amount_with_fee * sui_reserve;
    let denominator = (usdc_reserve * FEE_DENOMINATOR) + usdc_amount_with_fee;
    
    numerator / denominator
}

// Get accumulated fees
// 
// # Returns
// * (fee_sui, fee_usdc)
public fun get_fees(pool: &SUIUSDCPOOL): (u64, u64) {
    (
        balance::value(&pool.fee_sui),
        balance::value(&pool.fee_usdc)
    )
}


// Calculate LP tokens that would be minted for given input amounts
// 
// # Arguments
// * `pool` - Pool reference
// * `sui_amount` - SUI amount to add
// * `usdc_amount` - USDC amount to add
// 
// # Returns
// * Expected LP tokens to be minted
public fun calculate_lp_tokens_for_amounts(
    pool: &SUIUSDCPOOL, 
    sui_amount: u64, 
    usdc_amount: u64
): u64 {
    let sui_reserve = balance::value(&pool.sui_reserve);
    let usdc_reserve = balance::value(&pool.usdc_reserve);
    let total_lp_supply = coin::total_supply(&pool.lp_treasury);
    
    if (total_lp_supply == 0) {
        sqrt(sui_amount * usdc_amount)
    } else {
        let sui_lp_ratio = (sui_amount * total_lp_supply) / sui_reserve;
        let usdc_lp_ratio = (usdc_amount * total_lp_supply) / usdc_reserve;
        min(sui_lp_ratio, usdc_lp_ratio)
    }
}


// ========== ADMIN FUNCTIONS ==========
    
/// Collect accumulated fees (would need admin capability in production)
/// This is a simplified version - in production you'd want proper admin controls
public entry fun collect_fees(
    pool: &mut SUIUSDCPOOL,
    ctx: &mut TxContext
) {
    let fee_sui_amount = balance::value(&pool.fee_sui);
    let fee_usdc_amount = balance::value(&pool.fee_usdc);
    
    if (fee_sui_amount > 0) {
        let sui_coin = coin::from_balance(
            balance::withdraw_all(&mut pool.fee_sui),
            ctx
        );
        transfer::public_transfer(sui_coin, tx_context::sender(ctx));
    };
    
    if (fee_usdc_amount > 0) {
        let usdc_coin = coin::from_balance(
            balance::withdraw_all(&mut pool.fee_usdc),
            ctx
        );
        transfer::public_transfer(usdc_coin, tx_context::sender(ctx));
    };
}


// ========== TEST FUNCTIONS ==========
    
#[test_only]
/// Initialize module for testing
public fun init_for_testing(ctx: &mut TxContext) {
    init(POOL {}, ctx)
}

#[test_only]
/// Create test coins
public fun create_test_coins(ctx: &mut TxContext): (Coin<SUI>, Coin<USDC>) {
    (
        coin::mint_for_testing<SUI>(1000000, ctx),
        coin::mint_for_testing<USDC>(1000000, ctx)
    )
}
