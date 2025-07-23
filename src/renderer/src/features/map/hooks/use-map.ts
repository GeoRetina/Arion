// import { useState, useCallback } from 'react';
// import { Map } from 'maplibre-gl';

// interface UseMapReturn {
//   mapInstance: Map | null;
//   setMapInstance: (map: Map | null) => void;
//   // Add more map-specific functions here
// }

// export function useMap(): UseMapReturn {
//   const [mapInstance, setMapInstanceInternal] = useState<Map | null>(null);

//   const setMapInstance = useCallback((map: Map | null) => {
//     setMapInstanceInternal(map);
//   }, []);

//   return {
//     mapInstance,
//     setMapInstance,
//   };
// }

// For now, we'll keep it simple and manage the map instance directly in MapDisplay.tsx
// This file can be expanded later if needed.
export {} // Empty export to make it a module
