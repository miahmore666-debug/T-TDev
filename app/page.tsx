"use client";

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Chart from 'chart.js/auto';

export default function Home() {
  const supabase = createClientComponentClient();
  const [session, setSession] = useState<any>(null);
  const [compounds, setCompounds] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [pKaFilter, setPKaFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasP4, setHasP4] = useState<boolean | null>(null);

  const debounce = (fn: Function, ms: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  };

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/compounds');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const { compounds: data } = await response.json();
      let filteredData = data;
      
      if (search) {
        filteredData = filteredData.filter((c: any) => 
          c.name.toLowerCase().includes(search.toLowerCase())
        );
      }
      
      if (pKaFilter) {
        filteredData = filteredData.filter((c: any) => 
          c.properties?.pKa >= Number(pKaFilter)
        );
      }
      
      setCompounds(filteredData || []);
      setHasP4((filteredData || []).some((x: any) => x.name === 'P4-t-Bu'));
      localStorage.setItem('compounds', JSON.stringify(filteredData || []));
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to load compounds');
    } finally {
      setLoading(false);
    }
  };

  const debouncedSetSearch = debounce(setSearch, 300);
  const debouncedSetPKaFilter = debounce(setPKaFilter, 300);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: any } }) => setSession(data.session));
    supabase.auth.onAuthStateChange((_: string, s: any) => {
      setSession(s);
      if (s) load();
    });
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem('compounds');
    if (cached) setCompounds(JSON.parse(cached));
    if (session) load();
  }, [search, pKaFilter, session]);

  useEffect(() => {
    const ctx = document.getElementById('pkaEnergyChart') as HTMLCanvasElement;
    if (!ctx || compounds.length === 0) return;
    const chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Compounds (pKa vs Energy eV)',
          data: compounds
            .filter((c: any) => c.properties?.pKa && c.properties?.energy_eV)
            .map((c: any) => ({ x: c.properties.pKa, y: c.properties.energy_eV, name: c.name })),
          backgroundColor: '#1e90ff',
          borderColor: '#1e40af',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        scales: {
          x: { title: { display: true, text: 'pKa' } },
          y: { title: { display: true, text: 'Energy (eV)' } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.raw.name}: pKa=${ctx.raw.x}, Energy=${ctx.raw.y} eV`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [compounds]);

  const exportCSV = () => {
    const headers = ['name', 'formula', 'pKa', 'energy_eV', 'geometry', 'is_superbase', 'synthesis_notes'];
    const rows = compounds.map((c: any) => [
      c.name,
      c.formula || '',
      c.properties?.pKa ?? '',
      c.properties?.energy_eV ?? '',
      c.properties?.geometry ?? '',
      c.properties?.is_superbase ?? '',
      c.synthesis_notes || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}`));
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compounds.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const addCompound = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const formula = (form.elements.namedItem('formula') as HTMLInputElement).value;
    const pKa = (form.elements.namedItem('pKa') as HTMLInputElement).value;
    const energy = (form.elements.namedItem('energy') as HTMLInputElement).value;
    const geometry = (form.elements.namedItem('geometry') as HTMLInputElement).value;
    const notes = (form.elements.namedItem('notes') as HTMLTextAreaElement).value;

    setLoading(true);
    const properties = {
      pKa: pKa ? Number(pKa) : null,
      energy_eV: energy ? Number(energy) : null,
      geometry: geometry || null,
      is_superbase: pKa ? Number(pKa) > 25 : false,
    };
    const { data, error } = await supabase.from('chemical_compounds').upsert({
      name,
      formula: formula || null,
      properties,
      synthesis_notes: notes || null,
    }, { onConflict: 'name' }).select('id').single();
    if (!error) {
      const compound_id = data.id;
      const props = [
        { attribute: 'pKa', value: pKa ? Number(pKa) : null },
        { attribute: 'energy_eV', value: energy ? Number(energy) : null },
        { attribute: 'geometry', value: geometry || null },
        { attribute: 'is_superbase', value: pKa ? Number(pKa) > 25 : false },
      ].filter((p: any) => p.value !== null);
      if (props.length) {
        await supabase.from('compound_properties').upsert(
          props.map((p: any) => ({ compound_id, ...p })),
          { onConflict: 'compound_id,attribute' }
        );
      }
      await supabase.rpc('refresh_recent_compounds');
    }
    setLoading(false);
    if (error) alert(`Error: ${error.message}`);
    else load();
    form.reset();
  };

  if (!session) {
    return (
      <div className="card">
        <h3>Sign In</h3>
        <p className="muted">Use Google or magic link for miahmore666@gmail.com</p>
        <button
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: window.location.origin,
              },
            });
            if (error) alert(`Error: ${error.message}`);
          }}
        >
          Sign in with Google
        </button>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const email = (e.target as HTMLFormElement).email.value;
          const { error } = await supabase.auth.signInWithOtp({ email });
          alert(error ? `Error: ${error.message}` : 'Check your email for the magic link.');
        }}>
          <input name="email" type="email" placeholder="miahmore666@gmail.com" required />
          <button type="submit">Send Magic Link</button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1>T&T Chemistry DevHub</h1>
      <div className="row">
        <span className="pill">{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}>Sign Out</button>
      </div>
      <div className="card">
        <h3>P4-t-Bu Seed</h3>
        {hasP4 === null ? 'Checking…' : hasP4 ? (
          <span className="pill">Present</span>
        ) : (
          <div>
            <div className="muted">Not found. Click to insert:</div>
            <button onClick={async () => {
              const { data, error } = await supabase.from('chemical_compounds').insert({
                name: 'P4-t-Bu',
                formula: 'C32H60N4P',
                properties: { pKa: 42, energy_eV: 0.85, geometry: 'bulky phosphazene, superbasic', is_superbase: true },
                synthesis_notes: 'Handle under inert atmosphere.',
              }).select('id').single();
              if (!error) {
                const compound_id = data.id;
                await supabase.from('compound_properties').insert([
                  { compound_id, attribute: 'pKa', value: 42 },
                  { compound_id, attribute: 'energy_eV', value: 0.85 },
                  { compound_id, attribute: 'geometry', value: 'bulky phosphazene, superbasic' },
                  { compound_id, attribute: 'is_superbase', value: true },
                ]);
                await supabase.rpc('refresh_recent_compounds');
              }
              if (error) alert(`Error: ${error.message}`);
              else load();
            }}>Insert P4-t-Bu</button>
          </div>
        )}
      </div>
      <div className="card">
        <h3>Search Compounds</h3>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <input placeholder="Search by name" onChange={(e) => debouncedSetSearch(e.target.value)} style={{ width: '200px' }} />
          <input placeholder="pKa >" type="number" step="0.01" onChange={(e) => debouncedSetPKaFilter(e.target.value)} style={{ width: '120px' }} />
        </div>
      </div>
      <div className="card">
        <h3>Add/Update Compound</h3>
        <form onSubmit={addCompound}>
          <input name="name" placeholder="Name" required />
          <input name="formula" placeholder="Formula" />
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <input name="pKa" placeholder="pKa" type="number" step="0.01" style={{ width: '120px' }} />
            <input name="energy" placeholder="Energy (eV)" type="number" step="0.001" style={{ width: '140px' }} />
            <input name="geometry" placeholder="Geometry" style={{ width: '160px' }} />
          </div>
          <textarea name="notes" rows={3} placeholder="Synthesis Notes" />
          <button type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
        </form>
      </div>
      <div className="card">
        <h3>pKa vs Energy</h3>
        <canvas id="pkaEnergyChart" />
      </div>
      <div className="row">
        <h3>Compounds</h3>
        <div>
          <button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
          <button onClick={exportCSV} style={{ marginLeft: '8px' }}>Export CSV</button>
        </div>
      </div>
      {compounds.map((c: any) => (
        <div key={c.id} className="card">
          <div className="row">
            <strong>{c.name}</strong>
            <span className="pill">{c.formula || 'N/A'}</span>
          </div>
          <div>
            <div className="muted">Properties</div>
            <pre>{JSON.stringify(c.properties, null, 2)}</pre>
          </div>
          {c.synthesis_notes && (
            <div>
              <div className="muted">Synthesis Notes</div>
              <pre>{c.synthesis_notes}</pre>
            </div>
          )}
        </div>
      ))}
      <style jsx>{`
        :root { color-scheme: light dark; }
        body { font-family: system-ui, sans-serif; margin: 24px; }
        .card { border: 1px solid #ccc; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        input, textarea { width: 100%; padding: 8px; margin: 6px 0; }
        button { padding: 8px 12px; border-radius: 8px; border: 1px solid #aaa; cursor: pointer; }
        .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
        .pill { font-size: 12px; padding: 2px 8px; border: 1px solid #aaa; border-radius: 999px; }
        pre { white-space: pre-wrap; }
        .muted { opacity: .7; }
        canvas { max-width: 100%; }
      `}</style>
    </div>
  );
}
