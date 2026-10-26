import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 공고 카드 → 상세로 넘어갈 때 제목이 이어서 펼쳐진다 (React <ViewTransition>)
    viewTransition: true,
  },
};

export default nextConfig;
