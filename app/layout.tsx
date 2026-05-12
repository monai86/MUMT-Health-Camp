import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบกรอกข้อมูลตามฝ่าย",
  description: "เว็บแอพกรอกข้อมูลจาก Excel พร้อมสิทธิ์ตามฝ่าย"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
