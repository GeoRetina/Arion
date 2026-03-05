import { useEffect, useState } from 'react'

function Versions(): React.JSX.Element {
  const [appVersion, setAppVersion] = useState('unknown')

  useEffect(() => {
    void window.ctg
      .getAppVersion()
      .then((version) => setAppVersion(version))
      .catch(() => {
        setAppVersion('unknown')
      })
  }, [])

  return (
    <ul className="versions">
      <li className="app-version">Arion v{appVersion}</li>
    </ul>
  )
}

export default Versions
