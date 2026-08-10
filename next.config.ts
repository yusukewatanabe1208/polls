import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 画像は1枚10MBまで許可するため、既定の1MBから引き上げる
      bodySizeLimit: "12mb",
    },
    // 普通度は他ユーザーの回答で変わるため、画面遷移のたびに取り直す
    // （クライアント側のルーターキャッシュを無効化）
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
