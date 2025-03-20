import { anthropic } from "../api/anthropic";
import { executeGraphQLQuery } from "../api/graphql";

export class TokenAnalysisAgent {
  private systemPrompt: string = `
You are a DeFi and cryptocurrency expert specializing in Uniswap V3 token analysis. 
You provide data-driven insights on tokens, pools, liquidity, and market trends.
Your analysis considers multiple factors including price, liquidity, volume, fees, and market conditions.
All data comes from the Uniswap V3 protocol on Ethereum.
When presenting data, include relevant metrics and brief observations.
Present all financial data in a clear, readable format with proper units.
`;

  private queryGenerationPrompt: string = `
You are an expert in generating GraphQL queries based on a given schema. Your task is to create precise and accurate queries using only the schema provided below. Do not add any fields, entities, or relationships that are not explicitly defined in the schema. Ensure that the queries are 100% compliant with the schema and do not include any assumptions or external information.

Here is the schema:


type Factory @entity {
  # factory address
  id: ID!
  # amount of pools created
  poolCount: BigInt!
  # amoutn of transactions all time
  txCount: BigInt!
  # total volume all time in derived USD
  totalVolumeUSD: BigDecimal!
  # total volume all time in derived ETH
  totalVolumeETH: BigDecimal!
  # total swap fees all time in USD
  totalFeesUSD: BigDecimal!
  # total swap fees all time in USD
  totalFeesETH: BigDecimal!
  # all volume even through less reliable USD values
  untrackedVolumeUSD: BigDecimal!
  # TVL derived in USD
  totalValueLockedUSD: BigDecimal!
  # TVL derived in ETH
  totalValueLockedETH: BigDecimal!
  # TVL derived in USD untracked
  totalValueLockedUSDUntracked: BigDecimal!
  # TVL derived in ETH untracked
  totalValueLockedETHUntracked: BigDecimal!

  # current owner of the factory
  owner: ID!
}

# stores for USD calculations
type Bundle @entity {
  id: ID!
  # price of ETH in usd
  ethPriceUSD: BigDecimal!
}

type Token @entity {
  # token address
  id: ID!
  # token symbol
  symbol: String!
  # token name
  name: String!
  # token decimals
  decimals: BigInt!
  # token total supply
  totalSupply: BigInt!
  # volume in token units
  volume: BigDecimal!
  # volume in derived USD
  volumeUSD: BigDecimal!
  # volume in USD even on pools with less reliable USD values
  untrackedVolumeUSD: BigDecimal!
  # fees in USD
  feesUSD: BigDecimal!
  # transactions across all pools that include this token
  txCount: BigInt!
  # number of pools containing this token
  poolCount: BigInt!
  # liquidity across all pools in token units
  totalValueLocked: BigDecimal!
  # liquidity across all pools in derived USD
  totalValueLockedUSD: BigDecimal!
  # TVL derived in USD untracked
  totalValueLockedUSDUntracked: BigDecimal!
  # Note: for chains where ETH is not the native token, this will be the derived
  # price of that chain's native token, effectively, this should be renamed
  # derivedNative
  derivedETH: BigDecimal!
  # pools token is in that are white listed for USD pricing
  whitelistPools: [Pool!]!
  # derived fields
  tokenDayData: [TokenDayData!]! @derivedFrom(field: "token")
}

type Pool @entity {
  # pool address
  id: ID!
  # creation
  createdAtTimestamp: BigInt!
  # block pool was created at
  createdAtBlockNumber: BigInt!
  # token0
  token0: Token!
  # token1
  token1: Token!
  # fee amount
  feeTier: BigInt!
  # in range liquidity
  liquidity: BigInt!
  # current price tracker
  sqrtPrice: BigInt!
  # token0 per token1
  token0Price: BigDecimal!
  # token1 per token0
  token1Price: BigDecimal!
  # current tick
  tick: BigInt
  # current observation index
  observationIndex: BigInt!
  # all time token0 swapped
  volumeToken0: BigDecimal!
  # all time token1 swapped
  volumeToken1: BigDecimal!
  # all time USD swapped
  volumeUSD: BigDecimal!
  # all time USD swapped, unfiltered for unreliable USD pools
  untrackedVolumeUSD: BigDecimal!
  # fees in USD
  feesUSD: BigDecimal!
  # all time number of transactions
  txCount: BigInt!
  # all time fees collected token0
  collectedFeesToken0: BigDecimal!
  # all time fees collected token1
  collectedFeesToken1: BigDecimal!
  # all time fees collected derived USD
  collectedFeesUSD: BigDecimal!
  # total token 0 across all ticks
  totalValueLockedToken0: BigDecimal!
  # total token 1 across all ticks
  totalValueLockedToken1: BigDecimal!
  # tvl derived ETH
  totalValueLockedETH: BigDecimal!
  # tvl USD
  totalValueLockedUSD: BigDecimal!
  # TVL derived in USD untracked
  totalValueLockedUSDUntracked: BigDecimal!
  # Fields used to help derived relationship
  liquidityProviderCount: BigInt! # used to detect new exchanges
  # hourly snapshots of pool data
  poolHourData: [PoolHourData!]! @derivedFrom(field: "pool")
  # daily snapshots of pool data
  poolDayData: [PoolDayData!]! @derivedFrom(field: "pool")
  # derived fields
  mints: [Mint!]! @derivedFrom(field: "pool")
  burns: [Burn!]! @derivedFrom(field: "pool")
  swaps: [Swap!]! @derivedFrom(field: "pool")
  collects: [Collect!]! @derivedFrom(field: "pool")
  ticks: [Tick!]! @derivedFrom(field: "pool")
}

type Tick @entity {
  # format: <pool address>#<tick index>
  id: ID!
  # pool address
  poolAddress: String
  # tick index
  tickIdx: BigInt!
  # pointer to pool
  pool: Pool!
  # total liquidity pool has as tick lower or upper
  liquidityGross: BigInt!
  # how much liquidity changes when tick crossed
  liquidityNet: BigInt!
  # calculated price of token0 of tick within this pool - constant
  price0: BigDecimal!
  # calculated price of token1 of tick within this pool - constant
  price1: BigDecimal!
  # created time
  createdAtTimestamp: BigInt!
  # created block
  createdAtBlockNumber: BigInt!
}

type Transaction @entity {
  # txn hash
  id: ID!
  # block txn was included in
  blockNumber: BigInt!
  # timestamp txn was confirmed
  timestamp: BigInt!
  # gas used during txn execution
  gasUsed: BigInt!
  gasPrice: BigInt!
  # derived values
  mints: [Mint]! @derivedFrom(field: "transaction")
  burns: [Burn]! @derivedFrom(field: "transaction")
  swaps: [Swap]! @derivedFrom(field: "transaction")
  flashed: [Flash]! @derivedFrom(field: "transaction")
  collects: [Collect]! @derivedFrom(field: "transaction")
}

type Mint @entity {
  # transaction hash + "#" + index in mints Transaction array
  id: ID!
  # which txn the mint was included in
  transaction: Transaction!
  # time of txn
  timestamp: BigInt!
  # pool position is within
  pool: Pool!
  # allow indexing by tokens
  token0: Token!
  # allow indexing by tokens
  token1: Token!
  # owner of position where liquidity minted to
  owner: Bytes!
  # the address that minted the liquidity
  sender: Bytes
  # txn origin
  origin: Bytes! # the EOA that initiated the txn
  # amount of liquidity minted
  amount: BigInt!
  # amount of token 0 minted
  amount0: BigDecimal!
  # amount of token 1 minted
  amount1: BigDecimal!
  # derived amount based on available prices of tokens
  amountUSD: BigDecimal
  # lower tick of the position
  tickLower: BigInt!
  # upper tick of the position
  tickUpper: BigInt!
  # order within the txn
  logIndex: BigInt
}

type Burn @entity {
  # transaction hash + "#" + index in mints Transaction array
  id: ID!
  # txn burn was included in
  transaction: Transaction!
  # pool position is within
  pool: Pool!
  # allow indexing by tokens
  token0: Token!
  # allow indexing by tokens
  token1: Token!
  # need this to pull recent txns for specific token or pool
  timestamp: BigInt!
  # owner of position where liquidity was burned
  owner: Bytes
  # txn origin
  origin: Bytes! # the EOA that initiated the txn
  # amouny of liquidity burned
  amount: BigInt!
  # amount of token 0 burned
  amount0: BigDecimal!
  # amount of token 1 burned
  amount1: BigDecimal!
  # derived amount based on available prices of tokens
  amountUSD: BigDecimal
  # lower tick of position
  tickLower: BigInt!
  # upper tick of position
  tickUpper: BigInt!
  # position within the transactions
  logIndex: BigInt
}

type Swap @entity {
  # transaction hash + "#" + index in swaps Transaction array
  id: ID!
  # pointer to transaction
  transaction: Transaction!
  # timestamp of transaction
  timestamp: BigInt!
  # pool swap occured within
  pool: Pool!
  # allow indexing by tokens
  token0: Token!
  # allow indexing by tokens
  token1: Token!
  # sender of the swap
  sender: Bytes!
  # recipient of the swap
  recipient: Bytes!
  # txn origin
  origin: Bytes! # the EOA that initiated the txn
  # delta of token0 swapped
  amount0: BigDecimal!
  # delta of token1 swapped
  amount1: BigDecimal!
  # derived info
  amountUSD: BigDecimal!
  # The sqrt(price) of the pool after the swap, as a Q64.96
  sqrtPriceX96: BigInt!
  # the tick after the swap
  tick: BigInt!
  # index within the txn
  logIndex: BigInt
}

type Collect @entity {
  # transaction hash + "#" + index in collect Transaction array
  id: ID!
  # pointer to txn
  transaction: Transaction!
  # timestamp of event
  timestamp: BigInt!
  # pool collect occured within
  pool: Pool!
  # owner of position collect was performed on
  owner: Bytes
  # amount of token0 collected
  amount0: BigDecimal!
  # amount of token1 collected
  amount1: BigDecimal!
  # derived amount based on available prices of tokens
  amountUSD: BigDecimal
  # lower tick of position
  tickLower: BigInt!
  # uppper tick of position
  tickUpper: BigInt!
  # index within the txn
  logIndex: BigInt
}

type Flash @entity {
  # transaction hash + "-" + index in collect Transaction array
  id: ID!
  # pointer to txn
  transaction: Transaction!
  # timestamp of event
  timestamp: BigInt!
  # pool collect occured within
  pool: Pool!
  # sender of the flash
  sender: Bytes!
  # recipient of the flash
  recipient: Bytes!
  # amount of token0 flashed
  amount0: BigDecimal!
  # amount of token1 flashed
  amount1: BigDecimal!
  # derived amount based on available prices of tokens
  amountUSD: BigDecimal!
  # amount token0 paid for flash
  amount0Paid: BigDecimal!
  # amount token1 paid for flash
  amount1Paid: BigDecimal!
  # index within the txn
  logIndex: BigInt
}

# Data accumulated and condensed into day stats for all of Uniswap
type UniswapDayData @entity {
  # timestamp rounded to current day by dividing by 86400
  id: ID!
  # timestamp rounded to current day by dividing by 86400
  date: Int!
  # total daily volume in Uniswap derived in terms of ETH
  volumeETH: BigDecimal!
  # total daily volume in Uniswap derived in terms of USD
  volumeUSD: BigDecimal!
  # total daily volume in Uniswap derived in terms of USD untracked
  volumeUSDUntracked: BigDecimal!
  # fees in USD
  feesUSD: BigDecimal!
  # number of daily transactions
  txCount: BigInt!
  # tvl in terms of USD
  tvlUSD: BigDecimal!
}

# Data accumulated and condensed into day stats for each pool
type PoolDayData @entity {
  # timestamp rounded to current day by dividing by 86400
  id: ID!
  # timestamp rounded to current day by dividing by 86400
  date: Int!
  # pointer to pool
  pool: Pool!
  # in range liquidity at end of period
  liquidity: BigInt!
  # current price tracker at end of period
  sqrtPrice: BigInt!
  # price of token0 - derived from sqrtPrice
  token0Price: BigDecimal!
  # price of token1 - derived from sqrtPrice
  token1Price: BigDecimal!
  # current tick at end of period
  tick: BigInt
  # tvl derived in USD at end of period
  tvlUSD: BigDecimal!
  # volume in token0
  volumeToken0: BigDecimal!
  # volume in token1
  volumeToken1: BigDecimal!
  # volume in USD
  volumeUSD: BigDecimal!
  # fees in USD
  feesUSD: BigDecimal!
  # numebr of transactions during period
  txCount: BigInt!
  # opening price of token0
  open: BigDecimal!
  # high price of token0
  high: BigDecimal!
  # low price of token0
  low: BigDecimal!
  # close price of token0
  close: BigDecimal!
}

# hourly stats tracker for pool
type PoolHourData @entity {
  # format: <pool address>-<timestamp>
  id: ID!
  # unix timestamp for start of hour
  periodStartUnix: Int!
  # pointer to pool
  pool: Pool!
  # in range liquidity at end of period
  liquidity: BigInt!
  # current price tracker at end of period
  sqrtPrice: BigInt!
  # price of token0 - derived from sqrtPrice
  token0Price: BigDecimal!
  # price of token1 - derived from sqrtPrice
  token1Price: BigDecimal!
  # current tick at end of period
  tick: BigInt
  # tvl derived in USD at end of period
  tvlUSD: BigDecimal!
  # volume in token0
  volumeToken0: BigDecimal!
  # volume in token1
  volumeToken1: BigDecimal!
  # volume in USD
  volumeUSD: BigDecimal!
  # fees in USD
  feesUSD: BigDecimal!
  # numebr of transactions during period
  txCount: BigInt!
  # opening price of token0
  open: BigDecimal!
  # high price of token0
  high: BigDecimal!
  # low price of token0
  low: BigDecimal!
  # close price of token0
  close: BigDecimal!
}

type TokenDayData @entity {
  # token address concatendated with date
  id: ID!
  # timestamp rounded to current day by dividing by 86400
  date: Int!
  # pointer to token
  token: Token!
  # volume in token units
  volume: BigDecimal!
  # volume in derived USD
  volumeUSD: BigDecimal!
  # volume in USD even on pools with less reliable USD values
  untrackedVolumeUSD: BigDecimal!
  # liquidity across all pools in token units
  totalValueLocked: BigDecimal!
  # liquidity across all pools in derived USD
  totalValueLockedUSD: BigDecimal!
  # price at end of period in USD
  priceUSD: BigDecimal!
  # fees in USD
  feesUSD: BigDecimal!
  # opening price USD
  open: BigDecimal!
  # high price USD
  high: BigDecimal!
  # low price USD
  low: BigDecimal!
  # close price USD
  close: BigDecimal!
}

type TokenHourData @entity {
  # token address concatendated with date
  id: ID!
  # unix timestamp for start of hour
  periodStartUnix: Int!
  # pointer to token
  token: Token!
  # volume in token units
  volume: BigDecimal!
  # volume in derived USD
  volumeUSD: BigDecimal!
  # volume in USD even on pools with less reliable USD values
  untrackedVolumeUSD: BigDecimal!
  # liquidity across all pools in token units
  totalValueLocked: BigDecimal!
  # liquidity across all pools in derived USD
  totalValueLockedUSD: BigDecimal!
  # price at end of period in USD
  priceUSD: BigDecimal!
  # fees in USD
  feesUSD: BigDecimal!
  # opening price USD
  open: BigDecimal!
  # high price USD
  high: BigDecimal!
  # low price USD
  low: BigDecimal!
  # close price USD
  close: BigDecimal!
}

Based on this schema, generate the queries
use symbol_contains for comparision

if the query fails, finds the reason behind failing
try those possibilities until the result is generated from the query.


`;

  async processQuery(userQuery: string): Promise<string> {
    try {
      // Step 1: Generate the GraphQL query
      const { query, variables } = await this.generateGraphQLQuery(userQuery);

      // Step 2: Execute the query
      const data = await executeGraphQLQuery(query, variables);

      // Step 3: Generate analysis using Claude
      return await this.generateAnalysis(userQuery, data);
    } catch (error) {
      console.error("Error processing query:", error);
      return "Failed to process your query. Please try again with a different request.";
    }
  }

  private async generateGraphQLQuery(
    userQuery: string
  ): Promise<{ query: string; variables?: any }> {
    const prompt = this.queryGenerationPrompt + userQuery;

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 1000,
        system: this.systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      if (response.content[0].type === "text") {
        // Extract the GraphQL query from the response
        const responseText = response.content[0].text;

        // Use a regex to extract the query between ```graphql and ```
        const queryMatch = responseText.match(/```graphql([\s\S]*?)```/);

        if (queryMatch && queryMatch[1]) {
          // Clean the query by removing leading/trailing whitespace
          const query = queryMatch[1].trim();

          // Log the query for debugging
          console.log("Generated GraphQL Query:", query);

          // Return the query as a string
          return { query };
        } else {
          throw new Error("No valid GraphQL query found in Claude's response.");
        }
      } else {
        throw new Error("Expected a text response from Claude");
      }
    } catch (error) {
      console.error("Error generating GraphQL query:", error);
      throw new Error(
        "Failed to generate GraphQL query. Please try again later."
      );
    }
  }

  private async generateAnalysis(
    userQuery: string,
    data: any
  ): Promise<string> {
    const dataJson = JSON.stringify(data, null, 2);

    const prompt = `
I need you to analyze this Uniswap V3 token data and respond to the user's query.

User Query: "${userQuery}"

Data from Uniswap V3:
${dataJson}
`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 4000,
        system: this.systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      if (response.content[0].type === "text") {
        return response.content[0].text;
      } else {
        throw new Error("Expected a text response from Claude");
      }
    } catch (error) {
      console.error("Error generating analysis:", error);
      return "Failed to generate analysis. Please try again later.";
    }
  }
}
