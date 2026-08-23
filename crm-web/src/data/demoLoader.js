// La referencia dinámica solo existe en desarrollo. Vite elimina esta rama y
// el módulo completo de fixtures al compilar con import.meta.env.DEV=false.
export const loadDemoModule = import.meta.env.DEV
  ? async () => {
      const fixtures = await import('./demo.js')
      try {
        const response = await fetch('/crm-private-data.json', { cache: 'no-store' })
        if (!response.ok) return fixtures
        const privateFixtures = await response.json()
        return { ...fixtures, ...privateFixtures }
      } catch {
        return fixtures
      }
    }
  : null
