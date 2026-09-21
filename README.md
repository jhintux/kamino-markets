# Solstice Market

Next.js UI for the Kamino **Solstice Market** (`9Y7uwXgQ68mGqRtZfuFaP4hc4fxeJ7cE9zTtqTxVhfGU`).

It loads live reserve and obligation state with `@kamino-finance/klend-sdk`, including Hidden PT assets that are not shown in the official Kamino UI:

- PT-eUSX-01DEC26 mint `CAuiv9V7HrgxbDTsC9qqvzrbpRM1pqr7he2nY8vFKNfz` (vault `2p9vrKpUzgx6JoaNje9B3bPTFtNZeGJGhrg9DgfYT6Fr`)
- PT-USX-01DEC26 mint `FVS7CoMmdQRfby3ZrFwLDj236VCzGcd9tytZPxq5Q3rh` (vault `C3Kj9camyrAhTZmh9DzAjQpL47qT84jVFDgnnQnmPVY5`)

## Setup

```bash
npm install
cp .env.example .env.local
```

Optional: set `SOLANA_RPC_URL` (and `NEXT_PUBLIC_SOLANA_RPC_URL`) to a dedicated mainnet RPC if the public endpoint rate-limits.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect Phantom or Solflare, and supply / withdraw / borrow / repay from your existing Solstice loan.
