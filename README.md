# Farcaster ID Marketplace

A trustless marketplace for buying and selling Farcaster IDs (FIDs) on Optimism.

---

## Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Auth & Wallet**: Privy
- **Database**: Supabase
- **Chain**: Optimism Mainnet
- **Currency**: ETH
- **FID Data**: Pinata Hub (free, no API key)
- **Deploy**: Vercel

---

## Setup

### 1. Deploy the Smart Contract

Open `contracts/FarcasterMarketplace.sol` in [Remix IDE](https://remix.ethereum.org):

1. Paste the contract code
2. Set compiler to `0.8.20`
3. Deploy on **Optimism Mainnet** with your owner wallet address as the constructor argument
4. Copy the deployed contract address

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `supabase/schema.sql`
3. Copy your Project URL and anon key from Project Settings > API

### 3. Set Up Privy

1. Create an app at [dashboard.privy.io](https://dashboard.privy.io)
2. Add `localhost:3000` and your Vercel domain to allowed origins
3. Copy your App ID

### 4. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in all values:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_MARKETPLACE_ADDRESS=your_deployed_contract_address
NEXT_PUBLIC_OWNER_ADDRESS=your_owner_wallet_address
NEXT_PUBLIC_OPTIMISM_RPC=https://mainnet.optimism.io
```

### 5. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard or via CLI
vercel env add NEXT_PUBLIC_PRIVY_APP_ID
# ... repeat for all env vars
```

---

## How Trustless Transfer Works

The Farcaster Id Registry does not use the ERC721 `approve` pattern.
Instead, FID transfer requires the **receiving address to sign an EIP-712 message** first.

**Flow:**
1. Buyer signs `Transfer(fid, to, nonce, deadline)` EIP-712 message off-chain
2. Buyer submits ETH payment + signature to our contract
3. Our contract calls `IdRegistry.transfer(buyer, deadline, sig)` on-chain
4. FID moves to buyer atomically
5. ETH is split: 90% to seller, 10% to platform owner

This means neither party can be cheated — the swap is atomic.

---

## Fee Structure

| Action | Fee |
|--------|-----|
| Create listing | ~$0.20 USD in ETH (via Chainlink price feed) |
| Buy / Accept offer / Settle auction | 10% of sale price |

Fees are handled automatically on-chain and not shown in the UI.

---

## Contract Addresses (Optimism Mainnet)

| Contract | Address |
|----------|---------|
| Farcaster Id Registry | `0x00000000fc6c5f01fc30151999387bb99a9f489b` |
| Farcaster Id Gateway | `0x00000000fc25870c6ed6b6c7e41fb078b7656f69` |
| Chainlink ETH/USD (OP) | `0x13e3Ee699D1909E989722E753853AE30b17e08c5` |

---

## Project Structure

```
farcaster-marketplace/
├── contracts/
│   └── FarcasterMarketplace.sol     Smart contract (deploy via Remix)
├── supabase/
│   └── schema.sql                   Database schema
├── src/
│   ├── app/
│   │   ├── page.tsx                 Homepage
│   │   ├── layout.tsx               Root layout
│   │   ├── globals.css              Design system
│   │   ├── marketplace/page.tsx     Browse listings
│   │   ├── fid/[fid]/
│   │   │   ├── page.tsx             FID detail
│   │   │   ├── FidActions.tsx       Buy / bid / offer / list
│   │   │   └── OffersList.tsx       Manage offers
│   │   └── profile/page.tsx         User profile
│   ├── components/
│   │   ├── layout/Navbar.tsx
│   │   └── ui/
│   │       ├── FidCard.tsx
│   │       ├── SearchBar.tsx
│   │       └── ConnectButton.tsx
│   ├── lib/
│   │   ├── farcaster.ts             Pinata Hub API
│   │   ├── supabase.ts              DB helpers
│   │   ├── contract.ts              ABI + wagmi helpers
│   │   ├── providers.tsx            Privy + Wagmi setup
│   │   └── utils.ts                 Helpers
│   └── types/index.ts
├── .env.local.example
├── next.config.js
├── tailwind.config.js
└── vercel.json
```
