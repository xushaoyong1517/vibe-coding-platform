import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,  // 关闭左下角开发指示器，避免遮挡侧栏底部
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  webpack(config) {
    config.module.rules.push({
      test: /\.md/,
      type: 'asset/source',
    })
    return config
  },
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
}

export default nextConfig
