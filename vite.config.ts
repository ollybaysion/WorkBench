import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * 빌드 결과(dist/index.html)를 file:// 로 직접 열어도 동작하도록
 * 번들을 단일 IIFE로 만들고 <script type="module" crossorigin> 를 일반 defer 스크립트로 바꾼다.
 * (브라우저는 file:// 에서 module 스크립트 로드를 CORS로 차단함)
 */
function classicScript(): Plugin {
  return {
    name: 'workbench:classic-script',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin src=/g, '<script defer src=').replace(/(<link rel="stylesheet") crossorigin/g, '$1')
    },
  }
}

// https://vite.dev/config/
// base './' — file:// 및 GitHub Pages 하위 경로에서도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  plugins: [react(), classicScript()],
  build: {
    chunkSizeWarningLimit: 1000,
    modulePreload: false,
    rolldownOptions: {
      output: { format: 'iife' },
    },
  },
})
