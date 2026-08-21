// La referencia dinámica solo existe en desarrollo. Vite elimina esta rama y
// el módulo completo de fixtures al compilar con import.meta.env.DEV=false.
export const loadDemoModule = import.meta.env.DEV
  ? () => import('./demo.js')
  : null
