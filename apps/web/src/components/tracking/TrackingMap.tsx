import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Navigation,
  Compass,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Layers,
} from 'lucide-react';

export interface TrackingMapProps {
  driverLocation?: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    accuracy?: number | null;
    speedKmh?: number | null;
  } | null;
  origin?: {
    latitude?: number | null;
    longitude?: number | null;
    label: string;
  };
  destination?: {
    latitude?: number | null;
    longitude?: number | null;
    label: string;
  };
  myPickup?: {
    latitude?: number | null;
    longitude?: number | null;
    label?: string | null;
  } | null;
  otherPickups?: Array<{
    latitude: number;
    longitude: number;
    label: string;
    boardingStatus: string;
  }>;
  isStale?: boolean;
  className?: string;
}

function hasValidCoords<T extends { latitude?: number | null; longitude?: number | null } | null | undefined>(
  loc: T
): loc is T & { latitude: number; longitude: number } {
  return (
    typeof loc?.latitude === 'number' &&
    typeof loc?.longitude === 'number' &&
    !isNaN(loc.latitude) &&
    !isNaN(loc.longitude) &&
    loc.latitude >= -90 &&
    loc.latitude <= 90 &&
    loc.longitude >= -180 &&
    loc.longitude <= 180 &&
    !(loc.latitude === 0 && loc.longitude === 0)
  );
}

export const TrackingMap: React.FC<TrackingMapProps> = ({
  driverLocation,
  origin,
  destination,
  myPickup,
  otherPickups = [],
  isStale = false,
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Layer & Marker Refs
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const corridorLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  // Framing & Navigation state
  const isUserPannedRef = useRef<boolean>(false);
  const [isUserInteracting, setIsUserInteracting] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const initialFitDoneRef = useRef<boolean>(false);

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Initialize Map Instance
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const defaultLat = hasValidCoords(driverLocation)
      ? driverLocation.latitude
      : hasValidCoords(origin)
      ? origin.latitude
      : 12.8406;

    const defaultLng = hasValidCoords(driverLocation)
      ? driverLocation.longitude
      : hasValidCoords(origin)
      ? origin.longitude
      : 80.1534;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 14,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false, // Custom styled touch controls
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      dragging: true,
      attributionControl: false,
    });

    // Clean OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Subtle attribution at bottom right
    L.control
      .attribution({ position: 'bottomright', prefix: false })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>')
      .addTo(map);

    corridorLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Detect manual user navigation (pan, drag, pinch)
    const handleUserInteraction = (e: L.LeafletEvent) => {
      // 'dragstart' is exclusively user-initiated. For other events, check originalEvent.
      if (e.type === 'dragstart' || (e as any).originalEvent) {
        isUserPannedRef.current = true;
        setIsUserInteracting(true);
      }
    };

    map.on('dragstart', handleUserInteraction);
    map.on('zoomstart', handleUserInteraction);

    // Ensure map redraws correctly on container size change
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.off('dragstart', handleUserInteraction);
      map.off('zoomstart', handleUserInteraction);
      map.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
      accuracyCircleRef.current = null;
      routeLineRef.current = null;
      corridorLayerRef.current = null;
      initialFitDoneRef.current = false;
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Render Static Corridor Elements (Origin, Destination, Pickups, Route)
  //    Only re-runs when route landmarks change, NOT on every GPS update!
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const corridorLayer = corridorLayerRef.current;
    if (!map || !corridorLayer) return;

    corridorLayer.clearLayers();
    const corridorPoints: L.LatLngExpression[] = [];

    // 1. Origin Marker
    if (hasValidCoords(origin)) {
      const originIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="
            background: #1e40af;
            color: white;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
            box-shadow: 0 3px 8px rgba(30,64,175,0.4);
            border: 2.5px solid white;
          ">
            <span>A</span>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      L.marker([origin.latitude, origin.longitude], { icon: originIcon })
        .bindPopup(`<b>Ride Origin:</b><br/>${origin.label || 'Origin Stop'}`)
        .addTo(corridorLayer);
      corridorPoints.push([origin.latitude, origin.longitude]);
    }

    // 2. Destination Marker
    if (hasValidCoords(destination)) {
      const destIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="
            background: #dc2626;
            color: white;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            box-shadow: 0 3px 10px rgba(220,38,38,0.45);
            border: 2.5px solid white;
          ">
            <span id="destination-marker">🏁</span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker([destination.latitude, destination.longitude], { icon: destIcon })
        .bindPopup(`<b>Final Destination:</b><br/>${destination.label || 'Campus Destination'}`)
        .addTo(corridorLayer);
      corridorPoints.push([destination.latitude, destination.longitude]);
    }

    // 3. User's Own Designated Pickup Marker
    if (hasValidCoords(myPickup)) {
      const pickupIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div id="my-pickup-marker" style="
            background: #059669;
            color: white;
            border-radius: 20px;
            padding: 4px 10px 4px 8px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            box-shadow: 0 3px 10px rgba(5,150,105,0.4);
            border: 2px solid white;
          ">
            <span>📍 Your Pickup</span>
          </div>
        `,
        iconSize: [110, 28],
        iconAnchor: [55, 14],
      });

      L.marker([myPickup.latitude, myPickup.longitude], { icon: pickupIcon })
        .bindPopup(`<b>Your Pickup Point:</b><br/>${myPickup.label || 'Designated Stop'}`)
        .addTo(corridorLayer);
      corridorPoints.push([myPickup.latitude, myPickup.longitude]);
    }

    // 4. Other Passenger Pickups (Driver View)
    otherPickups.forEach((p) => {
      if (hasValidCoords(p)) {
        const isBoarded = p.boardingStatus === 'BOARDED';
        const bgColor = isBoarded ? '#10b981' : '#f59e0b';
        const icon = L.divIcon({
          className: 'custom-map-icon',
          html: `
            <div style="
              background: ${bgColor};
              color: white;
              border-radius: 50%;
              width: 28px;
              height: 28px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              font-weight: 700;
              box-shadow: 0 2px 6px rgba(0,0,0,0.25);
              border: 2px solid white;
            ">${p.label.substring(0, 2).toUpperCase()}</div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker([p.latitude, p.longitude], { icon })
          .bindPopup(`<b>Passenger Stop:</b><br/>${p.label} (${p.boardingStatus})`)
          .addTo(corridorLayer);
        corridorPoints.push([p.latitude, p.longitude]);
      }
    });

    // 5. Connect corridor landmarks with high-contrast polyline
    const polylineCoords: L.LatLngExpression[] = [];
    if (hasValidCoords(origin)) {
      polylineCoords.push([origin.latitude, origin.longitude]);
    }
    if (hasValidCoords(myPickup)) {
      polylineCoords.push([myPickup.latitude, myPickup.longitude]);
    }
    otherPickups.forEach((p) => {
      if (hasValidCoords(p)) {
        polylineCoords.push([p.latitude, p.longitude]);
      }
    });
    if (hasValidCoords(destination)) {
      polylineCoords.push([destination.latitude, destination.longitude]);
    }

    if (polylineCoords.length >= 2) {
      if (routeLineRef.current) {
        try { routeLineRef.current.remove(); } catch {}
      }
      routeLineRef.current = L.polyline(polylineCoords, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.75,
        dashArray: '8, 8',
      }).addTo(corridorLayer);
    }

    // Initial Bounds Framing (Executed ONCE on first valid render)
    if (!initialFitDoneRef.current && corridorPoints.length > 0) {
      if (hasValidCoords(driverLocation)) {
        corridorPoints.push([driverLocation.latitude, driverLocation.longitude]);
      }
      if (corridorPoints.length >= 2) {
        map.fitBounds(L.latLngBounds(corridorPoints), { padding: [50, 50], maxZoom: 15 });
      } else {
        map.setView(corridorPoints[0], 14);
      }
      initialFitDoneRef.current = true;
    }
  }, [origin, destination, myPickup, otherPickups]);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Dynamic Live Driver Marker Updates (Zero Full Layer Resets)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hasValidCoords(driverLocation)) {
      if (driverMarkerRef.current) {
        try { driverMarkerRef.current.remove(); } catch {}
        driverMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        try { accuracyCircleRef.current.remove(); } catch {}
        accuracyCircleRef.current = null;
      }
      return;
    }

    const { latitude, longitude, heading, accuracy, speedKmh } = driverLocation;

    // Distinct styling between live active vs stale signal
    const markerBg = isStale ? '#ea580c' : '#059669';
    const borderColor = '#ffffff';
    const rotation = typeof heading === 'number' && !isNaN(heading) ? heading : 0;
    const speedDisplay = typeof speedKmh === 'number' && speedKmh > 0 ? `${Math.round(speedKmh)} km/h` : null;

    const driverIcon = L.divIcon({
      className: 'custom-driver-marker-icon custom-driver-icon',
      html: `
        <div id="${isStale ? 'driver-marker-stale' : 'driver-marker'}" style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
          ${
            !isStale
              ? `<div style="
                  position: absolute;
                  width: 46px;
                  height: 46px;
                  border-radius: 50%;
                  background: rgba(5, 150, 105, 0.25);
                  animation: driver-radar-pulse 2s infinite ease-out;
                  pointer-events: none;
                "></div>`
              : ''
          }
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: ${markerBg};
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2.5px solid ${borderColor};
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            z-index: 10;
            transform: rotate(${rotation}deg);
            transition: transform 0.4s ease;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
            </svg>
          </div>
          ${
            isStale
              ? `<span style="
                  position: absolute;
                  bottom: -6px;
                  background: #ea580c;
                  color: white;
                  font-size: 9px;
                  font-weight: 800;
                  padding: 1px 5px;
                  border-radius: 4px;
                  border: 1px solid white;
                  white-space: nowrap;
                  z-index: 20;
                ">STALE</span>`
              : `<span style="
                  position: absolute;
                  bottom: -6px;
                  background: #059669;
                  color: white;
                  font-size: 9px;
                  font-weight: 800;
                  padding: 1px 5px;
                  border-radius: 4px;
                  border: 1px solid white;
                  white-space: nowrap;
                  z-index: 20;
                ">LIVE</span>`
          }
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    // Update or create driver marker
    if (!driverMarkerRef.current || !map.hasLayer(driverMarkerRef.current)) {
      if (driverMarkerRef.current) {
        try { driverMarkerRef.current.remove(); } catch {}
      }
      driverMarkerRef.current = L.marker([latitude, longitude], {
        icon: driverIcon,
        zIndexOffset: 2000,
      }).addTo(map);

      driverMarkerRef.current.bindPopup(
        `<b>Driver Location</b><br/>${isStale ? '<span style="color:#ea580c">⚠️ Signal Stale</span>' : '<span style="color:#059669">🟢 Live Tracking</span>'}${speedDisplay ? `<br/>Speed: ${speedDisplay}` : ''}`
      );
    } else {
      // Smooth position update
      driverMarkerRef.current.setLatLng([latitude, longitude]);
      driverMarkerRef.current.setIcon(driverIcon);
    }

    // Accuracy Circle
    if (accuracy && accuracy > 0 && accuracy < 600) {
      if (!accuracyCircleRef.current || !map.hasLayer(accuracyCircleRef.current)) {
        if (accuracyCircleRef.current) {
          try { accuracyCircleRef.current.remove(); } catch {}
        }
        accuracyCircleRef.current = L.circle([latitude, longitude], {
          radius: accuracy,
          color: isStale ? '#ea580c' : '#059669',
          dashArray: isStale ? '4, 6' : undefined,
          fillColor: isStale ? '#ea580c' : '#059669',
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng([latitude, longitude]);
        accuracyCircleRef.current.setRadius(accuracy);
        accuracyCircleRef.current.setStyle({
          color: isStale ? '#ea580c' : '#059669',
          dashArray: isStale ? '4, 6' : undefined,
          fillColor: isStale ? '#ea580c' : '#059669',
        });
      }
    } else if (accuracyCircleRef.current) {
      try { accuracyCircleRef.current.remove(); } catch {}
      accuracyCircleRef.current = null;
    }

    // Auto-Follow: ONLY pan smoothly if the user has NOT manually panned away
    if (!isUserPannedRef.current) {
      map.panTo([latitude, longitude], { animate: true, duration: 0.6 });
    }
  }, [driverLocation, isStale]);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Interactive Map Actions
  // ───────────────────────────────────────────────────────────────────────────
  const handleRecenterDriver = useCallback(() => {
    if (!mapRef.current) return;
    if (hasValidCoords(driverLocation)) {
      isUserPannedRef.current = false;
      setIsUserInteracting(false);
      mapRef.current.setView([driverLocation.latitude, driverLocation.longitude], 15, {
        animate: true,
      });
    }
  }, [driverLocation]);

  const handleFitCorridor = useCallback(() => {
    if (!mapRef.current) return;
    const points: L.LatLngExpression[] = [];
    if (hasValidCoords(driverLocation)) {
      points.push([driverLocation.latitude, driverLocation.longitude]);
    }
    if (hasValidCoords(origin)) {
      points.push([origin.latitude, origin.longitude]);
    }
    if (hasValidCoords(destination)) {
      points.push([destination.latitude, destination.longitude]);
    }
    if (hasValidCoords(myPickup)) {
      points.push([myPickup.latitude, myPickup.longitude]);
    }
    otherPickups.forEach((p) => {
      if (hasValidCoords(p)) {
        points.push([p.latitude, p.longitude]);
      }
    });

    if (points.length >= 2) {
      mapRef.current.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
    } else if (points.length === 1) {
      mapRef.current.setView(points[0], 14);
    }
  }, [driverLocation, origin, destination, myPickup, otherPickups]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  return (
    <div
      id="tracking-map-container"
      className={`tracking-map-container ${isExpanded ? 'tracking-map-expanded' : ''} ${className}`}
      style={{
        position: isExpanded ? 'fixed' : 'relative',
        top: isExpanded ? 0 : 'auto',
        left: isExpanded ? 0 : 'auto',
        right: isExpanded ? 0 : 'auto',
        bottom: isExpanded ? 0 : 'auto',
        width: '100%',
        height: isExpanded ? '100vh' : '460px',
        zIndex: isExpanded ? 9999 : 1,
        borderRadius: isExpanded ? '0' : '14px',
        overflow: 'hidden',
        border: isExpanded ? 'none' : '1px solid #e2e8f0',
        boxShadow: isExpanded ? 'none' : '0 4px 16px rgba(0,0,0,0.08)',
        backgroundColor: '#e5e7eb',
      }}
    >
      <style>{`
        @keyframes driver-radar-pulse {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        .leaflet-container {
          width: 100%;
          height: 100%;
          font-family: inherit;
          touch-action: pan-x pan-y;
        }
        .custom-driver-marker-icon {
          transition: transform 0.5s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .map-floating-btn {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
          transition: all 0.15s ease;
          min-width: 38px;
          min-height: 38px;
        }
        .map-floating-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .map-floating-btn:active {
          transform: scale(0.96);
        }
      `}</style>

      {/* Map DOM Element */}
      <div
        ref={mapContainerRef}
        data-testid="interactive-leaflet-map"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Top-Right Floating Controls (Touch-Friendly, Size >= 38px) */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <button
          type="button"
          id="btn-map-zoom-in"
          className="map-floating-btn"
          onClick={handleZoomIn}
          aria-label="Zoom in"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button
          type="button"
          id="btn-map-zoom-out"
          className="map-floating-btn"
          onClick={handleZoomOut}
          aria-label="Zoom out"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          type="button"
          id="btn-map-fit-corridor"
          className="map-floating-btn"
          onClick={handleFitCorridor}
          aria-label="Fit full route"
          title="Fit Route Corridor"
        >
          <Compass size={18} />
        </button>
        <button
          type="button"
          id="btn-map-expand"
          className="map-floating-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Minimize map' : 'Expand full screen'}
          title={isExpanded ? 'Minimize Map' : 'Full Screen Map'}
        >
          {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* Top-Left: Manual Pan Notification Pill */}
      {isUserInteracting && (
        <div
          id="map-free-pan-pill"
          data-testid="map-free-pan-indicator"
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#ffffff',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <span>Free Pan Active</span>
          <button
            type="button"
            onClick={handleRecenterDriver}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Re-center
          </button>
        </div>
      )}

      {/* Bottom Floating Bar: Re-center Driver Action */}
      {driverLocation && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            zIndex: 1000,
          }}
        >
          <button
            type="button"
            id="btn-recenter-driver"
            onClick={handleRecenterDriver}
            aria-label="Re-center on driver location"
            data-testid="recenter-driver-btn"
            className="map-floating-btn"
            style={{
              padding: '8px 16px',
              gap: '8px',
              background: '#ffffff',
              color: '#047857',
              borderColor: '#6ee7b7',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: '0 4px 12px rgba(4,120,87,0.2)',
            }}
          >
            <Navigation size={16} />
            <span>Re-center Driver</span>
          </button>
        </div>
      )}

      {/* Bottom-Left: Interactive Route Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '8px',
          padding: showLegend ? '8px 12px' : '6px 8px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          fontSize: '11px',
          color: '#334155',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
          onClick={() => setShowLegend(!showLegend)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={13} /> Legend
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>{showLegend ? '▼' : '▲'}</span>
        </div>

        {showLegend && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: isStale ? '#ea580c' : '#059669',
                }}
              />
              <span>{isStale ? 'Driver (Signal Stale)' : 'Driver (Live Active)'}</span>
            </div>
            {myPickup && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#059669', fontWeight: 800 }}>📍</span>
                <span>Your Designated Pickup</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#1e40af' }} />
              <span>Ride Origin</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🏁</span>
              <span>Final Destination</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
