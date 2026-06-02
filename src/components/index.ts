import Loading from './Loading.vue'
import ErrorBoundary from './ErrorBoundary.vue'

export { Loading, ErrorBoundary }

declare module 'vue' {
  export interface GlobalComponents {
    Loading: typeof Loading
    ErrorBoundary: typeof ErrorBoundary
  }
}
