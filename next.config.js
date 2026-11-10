/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'
};
