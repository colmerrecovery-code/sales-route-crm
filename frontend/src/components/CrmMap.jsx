import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';
import { Code, Tier, Temp } from './Badges.jsx';

const pin = (cls) => L.divIcon({ className: '', html: `<div class="pin ${cls}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
const numPin = (n) => L.divIcon({ className: '', html: `<div class="pin-num">${n}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 12); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [points.length]);
  return null;
}

/**
 * companies: [{id,name,lat,lng,tier,...}]  numbered: bool (show sequence numbers)
 * route: GeoJSON LineString | null   start: {lat,lng} | null
 */
export default function CrmMap({ companies = [], numbered = false, route = null, start = null, onSelect, children }) {
  const located = companies.filter((c) => c.lat != null);
  const points = located.map((c) => [c.lat, c.lng]).concat(start ? [[start.lat, start.lng]] : []);
  const line = route?.coordinates?.map(([lng, lat]) => [lat, lng]);
  return (
    <MapContainer center={[43.7, -79.7]} zoom={9} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds points={points} />
      {line && <Polyline positions={line} pathOptions={{ color: '#1F2326', weight: 5, opacity: .9 }} />}
      {line && <Polyline positions={line} pathOptions={{ color: '#F5B400', weight: 2, dashArray: '8 8' }} />}
      {start && <Marker position={[start.lat, start.lng]} icon={pin('start')}><Popup>Start / home base</Popup></Marker>}
      {located.map((c, i) => (
        <Marker key={c.id} position={[c.lat, c.lng]} icon={numbered ? numPin(i + 1) : pin(c.tier || 'tier2')} eventHandlers={onSelect ? { click: () => onSelect(c) } : {}}>
          <Popup>
            <div style={{ minWidth: 180 }}>
              <Code>{c.company_code}</Code> <b>{c.company_name || c.name}</b>
              <div className="small muted">{[c.address, c.city].filter(Boolean).join(', ')}</div>
              <div className="row" style={{ marginTop: 6 }}><Tier tier={c.tier} /><Temp t={c.temperature} /></div>
            </div>
          </Popup>
        </Marker>
      ))}
      {children}
    </MapContainer>
  );
}
