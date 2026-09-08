import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Vite's preview server refuses requests whose Host header it doesn't recognise
   (protection against DNS-rebinding). A bare IP passes that check, which is why
   http://100.76.9.82:5173 works — but a NAME does not, so Tailscale's MagicDNS
   name was rejected with "This host is not allowed".

   A leading dot allows a domain and everything under it, so this covers the
   Tailscale name whatever the Mac is called, without switching the check off. */
const allowedHosts = ['.ts.net', 'localhost'];

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, allowedHosts },
  preview: { port: 5173, allowedHosts },
});
