import {
    PF_WALLET,
    getCurrentTimestamp,
    solTrGrpcPfStart,
    solWalletImport,
    pfGetTokenDataByApi,
    sleep,
    solPrice,

} from "dv-sol-lib";

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from "./config"
import { doSniper, doSniperV2 } from "./sniper";
import dotenv from 'dotenv'
import { randomInt } from "crypto";

console.log('\n====================================');
console.log('🚀 STARTING BOT...');
console.log('====================================\n');

dotenv.config()

// Connection details logging
const RPC_URL = process.env.RPC_URL || 'default RPC';
const GRPC_URL = process.env.GRPC_URL || 'default GRPC';
const SHYFT_API_KEY = process.env.SHYFT_API_KEY || 'default Shyft API Key';

let monitorScanFlag = false;

console.log('📡 Connection Details:');
console.log(`   RPC URL: ${RPC_URL}`);
console.log(`   GRPC URL: ${GRPC_URL}\n`);

// Declare gSigner at the top level
let gSigner: any;

// Add this debug code here to inspect the solWalletImport function
console.log('\n📚 Checking solWalletImport function:');
console.log(solWalletImport.toString());

// Create a global connection instance
let solanaConnection: Connection;

// monitoring Token list
let graduatedTokens: Map<string, any> = new Map<string, any>();

export async function getTokenInfo(address: any) {
    try {
        var myHeaders = new Headers();
        myHeaders.append("x-api-key", SHYFT_API_KEY);

        var requestOptions: any = {
            method: 'GET',
            headers: myHeaders,
            redirect: 'follow'
        };

        const url = `https://defi.shyft.to/v0/pools/get_by_token?token=${address}`;
        const response = await fetch(url, requestOptions);
        const data = await response.json();

        const dexes = data?.result?.dexes;
        const fluxbeam = dexes?.fluxbeam?.pools[0];
        const orca = dexes?.orca?.pools[0];
        const meteoraAmm = dexes?.meteoraAmm?.pools[0];
        const raydium = dexes?.raydiumAmm?.pools[0];
        // Fluxbeam variables
        const fluxBeamTokenAccountA = fluxbeam?.tokenAccountA;
        const fluxBeamTokenAccountB = fluxbeam?.TokenAccountB;
        const fluxBeamMintA = fluxbeam?.mintA;
        const fluxBeamMintB = fluxbeam?.mintB;
        const fluxBeamLamports = fluxbeam?.lamports;
        const fluxBeamLpMint = fluxbeam?.tokenPool;
        const fluxBeamPublicKey = fluxbeam?.pubkey;
        const fluxBeamVaultLiquidity = fluxbeam?.liquidity;

        // Orca variables
        const orcaTokenAccountA = orca?.tokenVaultA;
        const orcaTokenAccountB = orca?.tokenVaultB;
        const orcaMintA = orca?.tokenMintA;
        const orcaMintB = orca?.tokenMintB;
        const orcaLiquidity = orca?.liquidity;
        const orcaLamports = orca?.lamports;
        const orcaPublicKey = orca?.pubkey;

        // Meteora AMM variables
        const meteoraTokenAccountA = meteoraAmm?.aVault;
        const meteoraTokenAccountB = meteoraAmm?.bVault;
        const meteoraMintA = meteoraAmm?.tokenAMint;
        const meteoraMintB = meteoraAmm?.tokenBMint;

        const meteoraLamports = meteoraAmm?._lamports;

        const meteoraPublicKey = meteoraAmm?.pubkey;
        const meteoraVaultLpA = meteoraAmm?.aVaultLp;
        const meteoraVaultLpB = meteoraAmm?.bVaultLp;

        // Raydium variables
        const raydiumTokenAccountA = raydium?.baseVault;
        const raydiumTokenAccountB = raydium?.quoteVault;
        const raydiumMintA = raydium?.quoteMint;
        const raydiumMintB = raydium?.baseMint;
        const raydiumLamports = raydium?.lamports;
        const raydiumLpMint = raydium?.lpMint;
        const raydiumPublicKey = raydium?.pubkey;
        const reserve = raydium?.lpReserve


        return {
            fluxBeamTokenAccountA,
            fluxBeamTokenAccountB,
            fluxBeamMintA,
            fluxBeamMintB,
            fluxBeamLamports,
            fluxBeamLpMint,
            fluxBeamPublicKey,

            orcaTokenAccountA,
            orcaTokenAccountB,
            orcaMintA,
            orcaMintB,
            orcaLiquidity,
            orcaLamports,

            orcaPublicKey,

            meteoraTokenAccountA,
            meteoraTokenAccountB,
            meteoraMintA,
            meteoraMintB,

            meteoraLamports,

            meteoraPublicKey,
            meteoraVaultLpA,
            meteoraVaultLpB,

            raydiumTokenAccountA,
            raydiumTokenAccountB,
            raydiumMintA,
            raydiumMintB,
            raydiumLamports,
            raydiumLpMint,
            raydiumPublicKey,
            reserve
        };
    } catch {
        console.log("error")
    }
}

export async function getTokenMarketCap(token: string) {
    let mc;
    let info;
    try {
        let random = randomInt(10000);
        for (let i = 0; i < 10; i++) {
            info = await getTokenInfo(token);
            if (info?.raydiumTokenAccountA !== undefined)
                break;
            await sleep(10000);
        }
        const baseTokenAmount = await solanaConnection.getTokenAccountBalance(new PublicKey(info?.raydiumTokenAccountA));
        const quoteTokenAmount = await solanaConnection.getTokenAccountBalance(new PublicKey(info?.raydiumTokenAccountB));
        const baseAmount = baseTokenAmount.value;
        const quoteAmount = quoteTokenAmount.value;
        mc = (Number)(baseAmount.amount) * solPrice * 1000000 / (Number)(quoteAmount.amount);
    } catch (err: any) {
        console.log("[LOG]####### getMarketCap ", err);
        const tokInfo = await pfGetTokenDataByApi(token);
        if (tokInfo && tokInfo.usd_market_cap !== undefined) {
            mc = tokInfo.usd_market_cap;
        } else {
            mc = 0;
        }
    }
    return mc;
}

// Define the transaction analyzer function
async function pfTrDataAnalyzer(data: any) {
    if (!data) {
        console.log('❌ Received empty data in analyzer');
        return;
    }

    // console.log(`\n🔄 New Transaction: ${data.type}`);
    switch (data.type) {
        case 'Mint':
            // console.log(`🌟 Mint detected for token: ${data.token}`);
            break;

        case 'Migration':
            console.log(`\n🚀 MIGRATION DETECTED`);
            console.log(`📍 Token Address: ${data.token}`);
            console.log(`  Market Maker: ${data.marketMaker}`);

            try {
                console.log('📊 Fetching token data...');
                const token = data.token;

                if (data.marketMaker !== PF_WALLET) {
                    throw new Error(`Fake pumpfun token. marketMaker = ${data.marketMaker}`)
                }
                const startTm = getCurrentTimestamp();
                const tokenInfo = await pfGetTokenDataByApi(token)
                // Detailed validation
                if (!tokenInfo) {
                    throw new Error('Token info response is empty ' + token);
                }

                if (typeof tokenInfo.created_timestamp === 'undefined') {
                    console.log('\n⚠️ Available fields in response:', Object.keys(tokenInfo));
                    throw new Error('Token info missing created_timestamp');
                }

                const stayedOnPF = (getCurrentTimestamp() - tokenInfo.created_timestamp) / 1000;
                const elapsedAfterKof = (getCurrentTimestamp() - tokenInfo.king_of_the_hill_timestamp) / 1000;

                console.log('\n📈 Token Analysis:');
                console.log(`   Time on PumpFun: ${stayedOnPF} seconds`);
                console.log(`   Elapsed after KOF: ${elapsedAfterKof} seconds`);
                console.log(`   Creator: ${tokenInfo.creator || 'Unknown'}`);

                if (stayedOnPF < config.stayMax) {
                    console.log(`\n⏭️  Skip to sniper (stay on pumpfun is in skip range < ${config.stayMax}}) s)...`);
                    break;
                }

                console.log(`\n🤍 Stayed time on pump.fun is enough to buy.`);
                if (config.marketCapMonitor) {
                    if (tokenInfo.usd_market_cap > config.marketCapMonitor.firstBuyLimit) {
                        console.log(`\n🚫 Too big market cap token! (${tokenInfo.usd_market_cap})`)
                        break;
                    }
                    tokenInfo.status = "Monitoring MarketCap ...";
                    tokenInfo.rmFlag = true;
                    tokenInfo.monitorFlag = true;
                    graduatedTokens.set(token, tokenInfo);
                    console.log(`\n🎯 Starting sniper process for token: ${token} ...`);
                    await doSniperV2(data, tokenInfo, startTm);
                    console.log('✅ Sniper process completed');

                } else {
                    console.log(`\n🎯 Starting sniper process for token: ${token} ...`);
                    await doSniper(data, tokenInfo);
                    console.log('✅ Sniper process completed');
                }
            } catch (error: any) {
                console.log(`\n❌ Error in migration process: ${error.message || error}`);
                const errorDetails = {
                    token: data.token,
                    errorType: error?.constructor?.name || 'Unknown',
                    errorMessage: error?.message || 'No error message',
                    errorStack: error?.stack || 'No stack trace',
                    timestamp: new Date().toISOString(),
                    apiEndpoint: `https://frontend-api.pump.fun/coins/${data.token}`
                };
                console.log('   Full Error Details:', JSON.stringify(errorDetails, null, 2));
            }
            break;
        case 'Trade':
            break;
        default:
            console.log(`ℹ️ Unhandled transaction type: ${data.type}`);
            break;
    }
}

async function monitorUpdateMarketCap() {
    if (monitorScanFlag) return;
    monitorScanFlag = true;
    for (let token of graduatedTokens.keys()) {
        const tokenInfo = graduatedTokens.get(token);
        if (!tokenInfo.monitorFlag) continue;
        const newmc = await getTokenMarketCap(token);
        if (newmc != null && !Number.isNaN(newmc))
            tokenInfo.usd_market_cap = newmc;
    }
    monitorScanFlag = false;
}

async function logMarketCap() {
    console.log("\n\n");
    console.log("------------------- Token ------------------  ------- Status ---------  --- MarketCap ---");
    for (let token of graduatedTokens.keys()) {
        const tokenInfo = graduatedTokens.get(token);
        // console.log(`${token}  ${tokenInfo.status}  ${tokenInfo.monitorFlag ? tokenInfo.usd_market_cap : ''}`);
        console.log(`${token}  ${tokenInfo.status}  ${tokenInfo.usd_market_cap}`);
    }
    console.log("-----------------------------------------------------------------------------------------\n\n");
}

async function main() {
    console.log('\n====================================');
    console.log('🚀 STARTING BOT...');
    console.log('====================================\n');

    // Use ENDPOINT instead of RPC_URL
    if (!RPC_URL) {
        console.log('❌ No ENDPOINT found in environment variables!');
        console.log('   Please ensure your .env file contains: ENDPOINT="https://rpc.shyft.to?api_key=..."');
        process.exit(1);
    }

    console.log('📡 Connection Details:');
    console.log(`   RPC URL: ${RPC_URL}`);
    console.log(`   GRPC URL: ${process.env.GRPC_URL || 'default GRPC'}\n`);

    // Initialize Solana connection
    solanaConnection = new Connection(RPC_URL, 'confirmed');

    // Test connection before proceeding
    try {
        const slot = await solanaConnection.getSlot();
        console.log('✅ RPC Connection verified:');
        console.log(`   Current slot: ${slot}`);
        // @ts-ignore - accessing internal property
        console.log(`   Using endpoint: ${solanaConnection._rpcEndpoint}`);
    } catch (error) {
        console.log('❌ Failed to connect to RPC:');
        console.log(`   ${error}`);
        process.exit(1);
    }

    // Initialize wallet
    console.log('\n🔑 Importing wallet...');
    try {
        gSigner = solWalletImport(process.env.PRIVATE_KEY!);

        if (!gSigner || !gSigner.publicKey) {
            throw new Error('Wallet import failed');
        }

        const walletBalance = await solanaConnection.getBalance(gSigner.publicKey);
        console.log('✅ Wallet imported successfully:');
        console.log(`   Address: ${gSigner.publicKey.toString()}`);
        console.log(`   Balance: ${walletBalance / 1e9} SOL`);
    } catch (error) {
        console.log('❌ Failed to verify wallet:');
        console.log(`   ${error}`);
        process.exit(1);
    }

    // Debug function to check connection details
    async function logConnectionDetails() {
        console.log('\n🔍 Connection Details:');
        if (!gSigner) {
            console.log('❌ No wallet initialized');
            return;
        }

        console.log(`   Wallet Public Key: ${gSigner.publicKey?.toString()}`);
        // @ts-ignore - accessing internal property
        console.log(`   RPC Endpoint: ${solanaConnection._rpcEndpoint}`);

        // Test actual RPC call
        solanaConnection.getSlot()
            .then(slot => console.log(`   ✅ Current slot: ${slot}`))
            .catch(err => console.log(`   ❌ RPC call failed: ${err}`))
    }

    // Log initial connection details
    logConnectionDetails();
    // Start periodic connection checks
    setInterval(logConnectionDetails, 30000);

    setInterval(logMarketCap, 10000);
    
    // Monitoring and update market caps
    setInterval(monitorUpdateMarketCap, 500);

    // Start GRPC with the analyzer
    console.log('\n📡 Initializing GRPC connection...');
    await solTrGrpcPfStart(pfTrDataAnalyzer);
    // await solTrGrpcRaydiumStart(raydiumTrDataAnalyzer);

    console.log('✅ GRPC connection established');
    console.log('\n👀 Bot is now monitoring for new transactions...\n');
}

// Export gSigner for use in other modules
export { gSigner, solanaConnection, graduatedTokens };

main().catch(error => {
    console.log('❌ Fatal error:');
    console.log(`   ${error}`);
    process.exit(1);
});