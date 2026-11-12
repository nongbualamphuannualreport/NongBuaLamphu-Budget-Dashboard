import type { NextConfig } from 'next';
const nextConfig:NextConfig={reactStrictMode:true,async redirects(){return [
 {source:'/allocation',destination:'/',permanent:false},
 {source:'/admin/allocation',destination:'/admin',permanent:false},
 {source:'/admin/disbursement',destination:'/admin',permanent:false},
 {source:'/admin/monitor',destination:'/admin',permanent:false},
];}};
export default nextConfig;
