# Raydium Auto Buy/Sell Bot based on MarketCap of Token

## `.env` File Description
This file contains environment variables required for the bot to function.

```plaintext
PRIVATE_KEY=<private key of your wallet>
RPC_URL="https://rpc.shyft.to?api_key=hhhhhhhhhhhhhhhh"
GRPC_URL="https://grpc.us2.shyft.to"
GRPC_ACCESS_TOKEN="cccccccc-8888-4444-8888-999999999999"
BLOCK_ENGINE_URL="ny.mainnet.block-engine.jito.wtf"
```

- `PRIVATE_KEY`: Your wallet's private key.
- `RPC_URL`, `GRPC_URL`, `GRPC_ACCESS_TOKEN`: These are purchased from [Shyft.to](https://shyft.to/).
- `BLOCK_ENGINE_URL`: URL for Jito block engine.


## `configure.json` File Description
This file contains trading parameters for bot configuration.

### **General Parameters**
- `tradeAmount`: Amount of SOL to buy and sell at once.
- `jitoBuyTip`: Jito tip when executing a buy transaction.
- `jitoSellTip`: Jito tip when executing a sell transaction.
- `tp` (Take Profit): If set to `60`, the bot sells when the price is higher than `buy price * 1.6`.
- `sl` (Stop Loss): If set to `99`, the bot sells when the price is lower than `buy price * 0.99`.
- `stayMax`: The time a token has lasted in `pump.fun`. If the time is greater than this value, the token is considered trustworthy and purchased.
- `timeout`: The duration (in milliseconds) after which the token is sold regardless of `tp` and `sl` values.
- `tp`, `sl`, and `timeout` are ignored when `marketCapMonitor.enabled` is set to `true`.

### **Market Cap Monitoring Parameters**
- `enabled`: Enable/disable market cap monitoring.
- `firstBuyLimit`: If the market cap is greater than this value on the first scan, the bot does not buy.
- `buyMinVal`: Minimum market cap required for purchasing.
- `delayTime`: Time (in ms) the token must maintain `buyMinVal` market cap before purchase.
- `delayLimit`: If the token does not reach `buyMinVal` within this time (ms), purchase is abandoned.
- `firstSellAmount`: Percentage of tokens to sell at `firstSellLevel * buyMinVal`.
- `firstSellLevel`: Market cap multiplier at which `firstSellAmount%` of tokens are sold.
- `secondSellLevel`: Market cap multiplier at which the remaining tokens are sold.

## **Example of `configure.json` File**
```json
{
  "tradeAmount": 0.1,
  "jitoBuyTip": 0.001,
  "jitoSellTip": 0.001,
  "tp": 60,
  "sl": 99,
  "stayMax": 0,
  "timeout": 300,
  "retryCount": 1,
  "marketCapMonitor": {
    "enabled": true,
    "firstBuyLimit": 5000000,
    "buyMinVal": 5000,
    "delayTime": 5000,
    "delayLimit": 10000,
    "firstSellAmount": 50,
    "firstSellLevel": 2,
    "secondSellLevel": 4
  }
}
```

### Notes
- Ensure the `.env` file is properly configured before running the bot.
- Modify the `configure.json` file based on your trading strategy.
- Be cautious with your `PRIVATE_KEY`, as it holds access to your funds.

For more details, visit [Shyft.to](https://shyft.to/).

