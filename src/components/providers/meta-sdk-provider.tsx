'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface MetaSDKContextType {
  isSdkReady: boolean;
  fbLoaded: boolean;
}

const MetaSDKContext = createContext<MetaSDKContextType>({
  isSdkReady: false,
  fbLoaded: false,
});

export function useMetaSDK() {
  return useContext(MetaSDKContext);
}

interface MetaSDKProviderProps {
  appId: string;
  version?: string;
  children: ReactNode;
}

export function MetaSDKProvider({ 
  appId, 
  version = 'v23.0', 
  children 
}: MetaSDKProviderProps) {
  const [isSdkReady, setIsSdkReady] = useState(false);
  const [fbLoaded, setFbLoaded] = useState(false);

  useEffect(() => {
    // Avoid double initialization
    if (document.getElementById('facebook-jssdk')) {
      if ((window as any).FB) {
        setIsSdkReady(true);
        setFbLoaded(true);
      }
      return;
    }

    // Define window.fbAsyncInit before loading the script
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: appId,
        autoLogAppEvents: true,
        cookie: true,
        xfbml: true,
        version: version,
      });
      // Both flags flip here, not in script.onload. `onload` fires once the
      // bundle is parsed but before fbAsyncInit has called FB.init, and
      // calling FB.login in that window launches an unconfigured dialog.
      setIsSdkReady(true);
      setFbLoaded(true);
    };

    // Load the SDK asynchronously
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';

    document.body.appendChild(script);

    return () => {
      // Cleanup is generally not recommended for the FB SDK as it can break things if re-mounted
      // but we could remove the script tag if absolutely necessary.
    };
  }, [appId, version]);

  return (
    <MetaSDKContext.Provider value={{ isSdkReady, fbLoaded }}>
      {children}
    </MetaSDKContext.Provider>
  );
}
