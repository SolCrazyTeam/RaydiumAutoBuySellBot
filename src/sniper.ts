import {
  SOL_ACCOUNT_RENT_FEE,
  getCurrentTimestamp, sleep,
  solRaydiumSwap, solRaydiumswapCalcAmountOut, solTokenBalance,
  solTrGetBalanceChange, solTrGetTimestamp
} from "dv-sol-lib"

import { gSigner, graduatedTokens } from "."
import { config } from "./config"
import { LiquidityPoolKeys } from "@raydium-io/raydium-sdk"

async function getTokenBalance(token: string): Promise<bigint> {
  let tokenBalance = BigInt('0')
  const startTm = getCurrentTimestamp()
  while (!tokenBalance) {
    if (getCurrentTimestamp() - startTm > 60000)
      break
    try {
      tokenBalance = (await solTokenBalance(token, gSigner.publicKey))[0]
      if (tokenBalance)
        return tokenBalance
    } catch (error) { }
    await sleep(300)
  }
  return tokenBalance
}

async function isNeedToSell(estAmount: number, boughtAmount: number, sellStartTm: number): Promise<boolean> {
  const percent = (estAmount / boughtAmount) * 100
  const tp = percent - 100
  const sl = 100 - percent
  if (tp > config.tp) {
    console.log(`[LOG](trade) TP meet! ${tp} %`)
    return true
  }
  if (sl > config.sl) {
    console.log(`[LOG](trade) SL meet! ${sl} %`)
    return true
  }
  const elapsedTime = (getCurrentTimestamp() - sellStartTm)
  if (elapsedTime > config.timeout) {
    console.log(`[LOG](trade) Timeout! ${elapsedTime} s`)
    return true
  }
  return false
}

async function reportBought(tx: string, startBlock: number) {
  const trTime = await solTrGetTimestamp(tx)
  if (!trTime)
    return
  console.log(`[LOG] +++++++++++++ bought after ${trTime.blockNumber - startBlock} blocks`)
}

export async function buy(token: string, poolKey: LiquidityPoolKeys): Promise<any> {
  let retryCnt = 0
  let tx: any
  const tokenInfo = graduatedTokens.get(token);

  while (true) {
    tx = await solRaydiumSwap(gSigner, poolKey, config.tradeAmount, true, config.jitoBuyTip)
    if (!tx || tx === '') {
      if (++retryCnt > config.retryCount) {
        console.log(`[LOG] Failed to buy.`)
        tokenInfo.status = "Buy Failed.             ";
        return undefined
      }
      await sleep(200)
      continue
    }

    console.log(`[LOG] ${retryCnt}th buy tx =`, tx)
    // balance check
    let tokenBalance
    const startTm = getCurrentTimestamp()
    do {
      if (getCurrentTimestamp() - startTm > 30000)
        break
      tokenBalance = await getTokenBalance(token)
      await sleep(1000)
    } while (!tokenBalance);
    if (tokenBalance) {
      break
    }
    if (++retryCnt > config.retryCount) {
      console.log(`[LOG] Failed to buy.`)
      tokenInfo.status = "Buy Failed.             ";
      return undefined
    }
  }
  return tx
}

export async function sell(poolKey: any, token: string, tx: string, addLiqBlock: number) {
  // balance check
  let tokenBalance = await getTokenBalance(token)
  if (!tokenBalance) {
    console.log(`[LOG] Failed to sell. (Balance zero) skipping ...`)
    return
  }

  let investAmount = await solTrGetBalanceChange(tx)
  if (investAmount) {
    investAmount = (0 - investAmount) - SOL_ACCOUNT_RENT_FEE
  } else {
    investAmount = config.tradeAmount
  }

  reportBought(tx, addLiqBlock)
  // sell process
  let estimatingSolAmount = 0
  const sellStartTm = getCurrentTimestamp()
  let sellTx
  while (tokenBalance) {
    try {
      const estimatedSellInfo = await solRaydiumswapCalcAmountOut(poolKey, tokenBalance, false)
      const expectingAmount = parseFloat(estimatedSellInfo.amountOut.toFixed())
      const tp = parseFloat(((expectingAmount / investAmount) * 100).toFixed(3))
      if (estimatingSolAmount != expectingAmount) {
        const passed = (getCurrentTimestamp() - sellStartTm) / 1000
        console.log(`[LOG](${token}) ******** (${expectingAmount}/${investAmount})(${tp} %) passed: ${passed} s`)
        estimatingSolAmount = expectingAmount
      }
      if (await isNeedToSell(expectingAmount, investAmount, sellStartTm)) {
        if (tp < 20) {
          console.log(`[LOG](${token}) ******** TP is quite low. return without selling ...`)
          return
        }
        sellTx = await solRaydiumSwap(gSigner, poolKey, tokenBalance, false, config.jitoSellTip)
      }
      tokenBalance = await getTokenBalance(token)
    } catch (error) { }
    await sleep(500)
  }
  console.log(`[LOG](${token}) sell finished. tx =`, sellTx)
}

export async function doSniper(data: any, tokenInfo: any) {
  const poolKey = data.poolKey
  const token = data.token
  console.log(`[LOG](${token}) snipping ...`)

  // buy
  console.log(`[LOG](${token}) buying ...`)
  const tx = await buy(token, poolKey)
  // sell
  sell(poolKey, token, tx, data.block)
}

export async function doSniperV2(data: any, tokenInfo: any, startTm: any) {
  const poolKey = data.poolKey;
  const token = data.token;
  const marketCapMonitor = config.marketCapMonitor;
  const delayTime: number = marketCapMonitor.delayTime;
  const delayLimit: number = marketCapMonitor.delayLimit;
  const buyMinVal: number = marketCapMonitor.buyMinVal;

  let mcStartTm = (tokenInfo.usd_market_cap >= buyMinVal) ? startTm : getCurrentTimestamp();
  try {
    while (true) {
      if ((getCurrentTimestamp() - startTm) > delayLimit) {
        if (tokenInfo.rmFlag) {
          console.log(`[LOG] Time out. Removing token ${token} from watch list...`);
          graduatedTokens.delete(token);
        }
        break;
      }
      // const nmc = await getTokenMarketCap(token);
      // if (nmc != undefined && !Number.isNaN(nmc))
      //   tokenInfo.usd_market_cap = nmc
      if (tokenInfo.usd_market_cap < buyMinVal) {
        mcStartTm = getCurrentTimestamp();
        await sleep(100);
        continue;
      }
      if (getCurrentTimestamp() - mcStartTm > delayTime) {
        console.log(`[LOG](${token}) Snipping ...`)
        tokenInfo.rmFlag = false;
        // buy
        console.log(`[LOG](${token}) Buying at ${tokenInfo.usd_market_cap} ...`)

        tokenInfo.status = "Buying ...              ";
        const tx = await buy(token, poolKey);

        if (tx === undefined || tx === '') {
          tokenInfo.status = "Buy Failed.             ";
          tokenInfo.monitorFlag = false;
          return;
        }
        tokenInfo.buyMc = tokenInfo.usd_market_cap;
        console.log(`[LOG](${token}) Selling ...      `);
        await sellV2(poolKey, token, tx, data.block);
        tokenInfo.monitorFlag = false;
        break;
      }
      await sleep(100);
    }
  } catch (err: any) {
    console.log(`\n❌ Error in sniper process: ${err.message || err}`);
  }
}

export async function sellV2(poolKey: any, token: string, tx: string, addLiqBlock: number) {
  // balance check
  let tokenBalance: any = await getTokenBalance(token);
  if (!tokenBalance) {
    console.log(`[LOG] Failed to sell. (Balance zero) skipping ...`)
    return
  }

  const tokenInfo = graduatedTokens.get(token);

  const delayMax = config.marketCapMonitor.delayLimit;
  const buyMinValue = config.marketCapMonitor.buyMinVal;
  const firstSellLevel = config.marketCapMonitor.firstSellLevel;
  const secondSellLevel = config.marketCapMonitor.secondSellLevel;
  const firstSellAmount = config.marketCapMonitor.firstSellAmount;

  let investAmount = (tokenBalance * (BigInt)(firstSellAmount)) / (BigInt)(100);

  reportBought(tx, addLiqBlock)


  // sell process
  let sellStartTm = getCurrentTimestamp()
  let sellTx
  while (true) {
    tokenInfo.status = "Monitoring MarketCap for Sell ...";
    try {
      if (getCurrentTimestamp() - sellStartTm > delayMax) {
        console.log(`[LOG](${token}) ******** Time out. Selling without price ...`)
        sellTx = await solRaydiumSwap(gSigner, poolKey, investAmount, false, config.jitoSellTip)
        break;
      }
      if (tokenInfo.usd_market_cap > tokenInfo.buyMc * firstSellLevel) {
        console.log(`[LOG](${token} ******** Market cap reached ${tokenInfo.buyMc * firstSellLevel}. Selling first step ... )`)
        sellTx = await solRaydiumSwap(gSigner, poolKey, investAmount, false, config.jitoSellTip)
        break;
      }
    } catch (error) { }
    await sleep(500)
  }
  if (sellTx === '' || sellTx === undefined) {
    console.log(`[LOG](${token} selling in first step failed.)`);
    tokenInfo.status = "First Sell failed.       ";
    return;
  }
  console.log(`[LOG](${token}) First sell finished. tx =`, sellTx)

  tokenBalance = await getTokenBalance(token);
  if (!tokenBalance) {
    console.log(`[LOG] Skip second sell. (Balance zero) skipping ...`)
    tokenInfo.status = "Second Sell skipped.";
    return
  }

  tokenInfo.status = "Selling " + tokenBalance + " in 2nd step ...";

  sellStartTm = getCurrentTimestamp();
  while (true) {
    try {
      if (getCurrentTimestamp() - sellStartTm > delayMax) {
        console.log(`[LOG](${token}) ******** Time out. Selling without price ...`)
        sellTx = await solRaydiumSwap(gSigner, poolKey, tokenBalance, false, config.jitoSellTip)
        break;
      }
      if (tokenInfo.usd_market_cap > tokenInfo.buyMc * secondSellLevel) {
        console.log(`[LOG](${token} ******** Market cap reached ${tokenInfo.buyMc * secondSellLevel}. Selling ... )`)
        sellTx = await solRaydiumSwap(gSigner, poolKey, tokenBalance, false, config.jitoSellTip)
        break;
      }      
    } catch (error) { }
    await sleep(500)
  }
  console.log(`[LOG](${token}) Second sell finished. tx =`, sellTx)
  if (sellTx === undefined || sellTx === '') {
    tokenInfo.status = "Second Sell failed.      "
    return;
  }
  tokenInfo.status = "Sell finished.          ";
}
