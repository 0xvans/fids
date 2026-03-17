/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow all external domains - Farcaster PFPs can come from anywhere
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    // Disable image optimization for external URLs to avoid DNS issues
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': require.resolve(
        './src/lib/async-storage-mock.js'
      ),
    }
    return config
  },
}

module.exports = nextConfig