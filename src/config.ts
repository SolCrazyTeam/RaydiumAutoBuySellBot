import { sleep } from "dv-sol-lib"
import * as fs from 'fs';

export interface MarketCapMonitorParam {
  enabled: boolean,
  delayTime: number,
  delayLimit: number,
  firstBuyLimit: number,
  buyMinVal: number,
  firstSellAmount: number,
  firstSellLevel: number,
  secondSellLevel: number
}

interface Config {
  tradeAmount: number,
  tp: number,
  sl: number,
  jitoBuyTip: number,
  jitoSellTip: number,
  timeout: number,
  jitoFee: number,
  stayMax: number,
  retryCount: number,
  marketCapMonitor: MarketCapMonitorParam,
}

export let config: Config

async function loadConfig() {
  while (true) {
    try {
      const fdata = fs.readFileSync('config.json', 'utf8')
      config = JSON.parse(fdata)
      await sleep(5000)
    } catch (error) { }
  }
}

loadConfig()