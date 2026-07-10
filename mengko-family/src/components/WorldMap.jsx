import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { getCityCoords } from '../utils/geocode';
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup,
} from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

function markerColor(count) {
  if (count >= 11) return '#c9a84c';
  if (count >= 7)  return '#b34a5c';
  if (count >= 4)  return '#8a2c3d';
  if (count >= 2)  return '#6b1f2e';
  return '#4a1520';
}

function markerRadius(count) {
  return Math.min(4 + count * 2, 18);
}

export default function WorldMap() {
  const [cities, setCities] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const q = query(
          collection(db, 'family_members'),
          where('status', '==', 'approved'),
        );
        const snap = await getDocs(q);
        const counts = {};
        snap.forEach((doc) => {
          const city = (doc.data().city || '').trim();
          if (!city) return;
          counts[city] = (counts[city] || 0) + 1;
        });
        const result = [];
        for (const [city, count] of Object.entries(counts)) {
          const coords = getCityCoords(city);
          if (coords) result.push({ city, count, coords });
        }
        setCities(result);
      } catch (err) {
        console.error('WorldMap load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
        </div>
      )}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [15, 10] }}
        style={{ width: '100%', height: 'auto' }}
      >
        <ZoomableGroup zoom={1} minZoom={0.8} maxZoom={6}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#141d2e"
                  stroke="#283754"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none' },
                    hover:   { fill: '#1c2740', outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {cities.map(({ city, count, coords }) => (
            <Marker
              key={city}
              coordinates={coords}
              onMouseEnter={() => setTooltip({ city, count })}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => setTooltip(tooltip?.city === city ? null : { city, count })}
              style={{ cursor: 'pointer' }}
            >
              <circle
                r={markerRadius(count)}
                fill={markerColor(count)}
                fillOpacity={0.85}
                stroke="#fff"
                strokeWidth={1.2}
              />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 backdrop-blur-sm text-sm px-4 py-2 pointer-events-none shadow-xl border"
          style={{ background: 'rgba(13,20,32,0.95)', borderColor: 'rgba(201,168,76,0.35)' }}
        >
          <p className="font-display font-semibold" style={{ color: '#c9a84c' }}>{tooltip.city}</p>
          <p className="text-xs mt-0.5" style={{ color: '#ece4d3' }}>
            {tooltip.count} family member{tooltip.count > 1 ? 's' : ''} here
            {' · '}
            <span style={{ color: '#b34a5c' }}>Contact allova@mengko.com</span>
          </p>
        </div>
      )}

      {/* Legend */}
      {cities.length > 0 && (
        <div className="absolute top-3 right-3 backdrop-blur-sm px-3 py-2 border" style={{ background: 'rgba(13,20,32,0.85)', borderColor: '#283754' }}>
          <p className="text-xs mb-1.5 font-medium" style={{ color: '#ece4d3', opacity: 0.6 }}>Members per city</p>
          {[
            { label: '1',    color: '#4a1520' },
            { label: '2-3',  color: '#6b1f2e' },
            { label: '4-6',  color: '#8a2c3d' },
            { label: '7-10', color: '#b34a5c' },
            { label: '11+',  color: '#c9a84c' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 mb-1">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ background: color }} />
              <span className="text-xs" style={{ color: '#ece4d3', opacity: 0.75 }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {cities.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm" style={{ color: '#ece4d3', opacity: 0.4 }}>No approved members yet</p>
        </div>
      )}
    </div>
  );
}
