import Router from './router'
import { useLayoutEffect } from 'react'
import useStore from './store'

export default function App() {
  const theme = useStore(s => s.theme)
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
  }, [theme])
  return <Router />
}
