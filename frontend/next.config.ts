import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async redirects() {
        return [
            {
                source: '/platform/:id/learning/exercise',
                destination: '/platform/:id/learning/exercises',
                permanent: true,
            },
        ]
    },
};

export default nextConfig;
