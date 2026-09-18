import { defineConfig, loadEnv } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import { buildManifest } from './src/manifest.config.js'

/**
 * El empaquetado existe por una razón concreta, y conviene recordarla: un
 * service worker de tipo módulo NO resuelve especificadores desnudos, así que
 * `import { openVault } from '@projectellysia/acheron-core-web'` no funciona
 * tal cual dentro de una extensión. Lo comprobó el espolón de AC15 (#482), y
 * es lo que obliga a empaquetar en vez de servir los ficheros a pelo.
 *
 * `@crxjs/vite-plugin` se encarga además del manifiesto y de recargar la
 * extensión en caliente durante el desarrollo.
 */
export default defineConfig(({ mode }) => {
  // El manifiesto tiene que declarar `host_permissions` de forma ESTÁTICA, así
  // que la URL de la API se resuelve en tiempo de construcción y no en
  // ejecución. Apuntar la extensión a otro servidor obliga a reconstruirla, y
  // eso es correcto: es un cambio de permisos, no de configuración.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiUrl = env.VITE_ELLYSIA_API_URL ?? 'https://api.ellysia.es'

  return {
    plugins: [crx({ manifest: buildManifest(apiUrl) })],
    define: {
      __ELLYSIA_API_URL__: JSON.stringify(apiUrl),
    },
    build: {
      rollupOptions: {
        // El rellenador NO está en el manifiesto —no hay `content_scripts`—,
        // así que crxjs no lo descubre solo: se declara aquí para que acabe en
        // `dist/`, porque `chrome.scripting.executeScript` inyecta un fichero
        // que tiene que existir.
        //
        // Y por eso mismo `autofill.ts` no puede importar nada en tiempo de
        // ejecución: lo que inyecta `executeScript` es un script clásico, no un
        // módulo, y un `import` ahí dentro fallaría en la página del usuario.
        input: {
          autofill: 'src/content/autofill.ts',
        },
        // Chrome carga la extensión desde disco: no hay caché de navegador que
        // invalidar, y los nombres estables hacen legible un diff de `dist/`.
        output: {
          chunkFileNames: 'assets/[name].js',
          entryFileNames: 'assets/[name].js',
        },
      },
    },
  }
})
