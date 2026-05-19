import React, { useState, useEffect, useCallback } from 'react';
import { 
  Sprout, 
  Users, 
  Search, 
  Download, 
  UserPlus, 
  LogOut, 
  TrendingDown, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Eye, 
  EyeOff, 
  MapPin, 
  Phone,
  ArrowRight,
  TrendingUp,
  FileText
} from 'lucide-react';

const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:5000' 
  : window.location.origin;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('fpo_token') || '');
  const [user, setUser] = useState(null);
  
  // Auth state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Dashboard state
  const [farms, setFarms] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters & Modal
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all | low | good
  const [showAddModal, setShowAddModal] = useState(false);
  const [districtFarms, setDistrictFarms] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [addingFarmId, setAddingFarmId] = useState(null);

  // ── Auth Handlers ──────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError('Please enter both username and password.');
      return;
    }
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API}/auth/fpo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }
      localStorage.setItem('fpo_token', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setLoginError(err.message || 'Server error. Please check your connection.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('fpo_token');
    setToken('');
    setUser(null);
    setFarms([]);
    setStats(null);
  };

  // ── Fetch Dashboard Data ───────────────────────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [farmsRes, statsRes] = await Promise.all([
        fetch(`${API}/fpo/farms`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/fpo/stats`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (farmsRes.status === 401 || statsRes.status === 401) {
        handleLogout();
        return;
      }

      const farmsData = await farmsRes.json();
      const statsData = await statsRes.json();

      if (farmsData.success) setFarms(farmsData.farms || []);
      if (statsData.success) setStats(statsData);
    } catch (err) {
      setError('Could not connect to the database. Verify the server is online.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Load user data on startup
  useEffect(() => {
    if (token) {
      // Validate token & get /me info
      fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => {
          if (!res.ok) throw new Error('Session expired');
          return res.json();
        })
        .then(data => {
          if (data.success) setUser(data.user);
        })
        .catch(() => {
          handleLogout();
        });
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDashboardData();
    }
  }, [token, fetchDashboardData]);

  // ── District Farms (Add Modal) ─────────────────────────────────────────────
  const openAddModal = async () => {
    setShowAddModal(true);
    setModalLoading(true);
    try {
      const res = await fetch(`${API}/fpo/district-farms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDistrictFarms(data.farms || []);
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleAddFarm = async (farmId) => {
    setAddingFarmId(farmId);
    try {
      const res = await fetch(`${API}/fpo/members`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ farm_id: farmId })
      });
      const data = await res.json();
      if (data.success) {
        setDistrictFarms(prev => 
          prev.map(f => f.farm_id === farmId ? { ...f, already_added: true } : f)
        );
        fetchDashboardData(); // Refresh list & stats
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingFarmId(null);
    }
  };

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const handleExportCSV = async () => {
    try {
      const res = await fetch(`${API}/fpo/export`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FPO_Report_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.csv`;
      a.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  // ── Render Helpers ─────────────────────────────────────────────────────────
  const getScoreBadgeClass = (score) => {
    if (score >= 70) return 'score-badge score-good';
    if (score >= 40) return 'score-badge score-mid';
    return 'score-badge score-bad';
  };

  const getCropEmoji = (crop) => {
    const emojis = { 
      wheat: '🌾', rice: '🍚', maize: '🌽', cotton: '🌿', 
      sugarcane: '🎋', soybean: '🫛', groundnut: '🥜', pulses: '🫘' 
    };
    return emojis[crop?.toLowerCase()] || '🌱';
  };

  // Filter & Search Logic
  const filteredFarms = farms.filter(f => {
    const matchesSearch = 
      (f.farm_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.farmer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.crop || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    if (filterType === 'low') {
      return matchesSearch && (f.soil_health_score || 0) < 50;
    }
    if (filterType === 'good') {
      return matchesSearch && (f.soil_health_score || 0) >= 70;
    }
    return matchesSearch;
  });

  // ─── LOGIN SCREEN ──────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="login-page">
        <div className="login-box">
          <div className="login-logo-wrap">
            <span className="sprout-icon"><Sprout size={36} color="#ffffff" /></span>
          </div>
          <h1 className="login-title">FPO Dashboard</h1>
          <p className="login-sub">MittiCard — Farmer Producer Organisation</p>

          <form onSubmit={handleLogin} className="login-form">
            <div className="field">
              <label>FPO Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. fpo_nagpur" 
                required
              />
            </div>
            
            <div className="field">
              <label>Password</label>
              <div className="password-input-wrap">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter FPO password" 
                  required
                />
                <button 
                  type="button" 
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loginLoading}>
              {loginLoading ? (
                <span className="btn-loader">
                  <Loader2 className="spinner-icon" size={18} /> Logging in...
                </span>
              ) : (
                <>Login to Dashboard <ArrowRight size={18} style={{ marginLeft: 6 }} /></>
              )}
            </button>
          </form>

          {loginError && <div className="login-err">{loginError}</div>}
          
          <div className="login-footer">
            <p>Don't have credentials? Contact your <span>MittiCard Admin</span></p>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN DASHBOARD ────────────────────────────────────────────────────────
  return (
    <div className="dashboard-layout">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo-badge">
            <Sprout size={28} />
          </div>
          <div>
            <h1 className="header-title">MittiCard FPO Dashboard</h1>
            <p className="header-sub">Regional Soil Health Monitoring & Bulk Resource Planner</p>
          </div>
        </div>
        
        <div className="header-right">
          {user && (
            <div className="user-badge">
              <span className="dot"></span>
              FPO: <strong>{user.district || 'Nagpur'}</strong>
            </div>
          )}
          <button onClick={handleExportCSV} className="btn btn-accent" title="Export report to CSV">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={openAddModal} className="btn btn-primary">
            <UserPlus size={16} /> Add Farmer
          </button>
          <button onClick={handleLogout} className="btn btn-logout" title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="main-content">
        {loading && !farms.length ? (
          <div className="dashboard-loading">
            <Loader2 className="spinner-icon-large" />
            <p>Loading FPO records...</p>
          </div>
        ) : error ? (
          <div className="dashboard-error">
            <AlertTriangle size={48} />
            <p>{error}</p>
            <button onClick={fetchDashboardData} className="btn btn-primary" style={{ marginTop: 12 }}>
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {/* Alert bar if Nitrogen levels are deficient in the region */}
            {stats && stats.deficiency_breakdown?.nitrogen_low?.count > 0 && (
              <div className="alert-bar">
                <AlertTriangle size={20} color="#92400E" />
                <div>
                  <strong>Regional Alert:</strong> Low nitrogen (N) detected on{' '}
                  <span style={{ fontWeight: 700 }}>{stats.deficiency_breakdown.nitrogen_low.percentage}</span> of member farms in {user?.district || 'Nagpur'}. 
                  Consider coordinating a bulk fertilizer order of Urea or organic compost for cost savings!
                </div>
              </div>
            )}

            {/* Stats Cards Row */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-icon-container bg-green">
                  <Users size={22} color="#1B4332" />
                </div>
                <div>
                  <div className="stat-value">{farms.length}</div>
                  <div className="stat-label">Total Farms Joined</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon-container bg-blue">
                  <TrendingUp size={22} color="#1E3A8A" />
                </div>
                <div>
                  <div className="stat-value">
                    {stats ? `${stats.average_soil_health_score}/100` : '—'}
                  </div>
                  <div className="stat-label">Average Health Score</div>
                </div>
              </div>

              <div className="stat-card font-orange">
                <div className="stat-icon-container bg-orange">
                  <TrendingDown size={22} color="#78350F" />
                </div>
                <div>
                  <div className="stat-value">
                    {stats ? stats.deficiency_breakdown?.nitrogen_low?.count : 0}
                  </div>
                  <div className="stat-label">Farms Deficient in N</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon-container bg-teal">
                  <CheckCircle2 size={22} color="#0D9488" />
                </div>
                <div>
                  <div className="stat-value">
                    {farms.length > 0 
                      ? `${Math.round((farms.filter(f => (f.soil_health_score || 0) >= 70).length / farms.length) * 100)}%`
                      : '0%'}
                  </div>
                  <div className="stat-label">Good Soil Ratio</div>
                </div>
              </div>
            </div>

            {/* Analytics Rows */}
            <div className="charts-row">
              {/* Deficiency Breakdown */}
              <div className="card">
                <h3 className="card-title"><TrendingDown size={18} /> Deficiency Breakdown</h3>
                <p className="card-sub">Percentage of regional farms scoring below healthy thresholds.</p>
                
                {stats?.deficiency_breakdown ? (
                  <div className="deficiency-list">
                    {[
                      { label: 'Nitrogen (N < 140 mg/kg)', field: 'nitrogen_low', color: '#EF4444' },
                      { label: 'Phosphorus (P < 11 mg/kg)', field: 'phosphorus_low', color: '#F97316' },
                      { label: 'Potassium (K < 108 mg/kg)', field: 'potassium_low', color: '#F59E0B' },
                      { label: 'Organic Carbon (OC < 0.5%)', field: 'organic_carbon_low', color: '#84CC16' },
                      { label: 'Zinc (Zn < 0.6 mg/kg)', field: 'zinc_deficient', color: '#06B6D4' },
                      { label: 'Sulfur (S < 10 mg/kg)', field: 'sulfur_deficient', color: '#3B82F6' },
                      { label: 'Iron (Fe < 4.5 mg/kg)', field: 'iron_deficient', color: '#6366F1' },
                    ].map(def => {
                      const data = stats.deficiency_breakdown[def.field] || { count: 0, percentage: '0%' };
                      return (
                        <div key={def.field} className="def-row">
                          <span className="def-label">{def.label}</span>
                          <div className="def-bar-bg">
                            <div 
                              className="def-bar" 
                              style={{ 
                                width: data.percentage, 
                                backgroundColor: def.color 
                              }}
                            />
                          </div>
                          <span className="def-pct">{data.percentage}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">No nutrient scans recorded yet.</div>
                )}
              </div>

              {/* Crop Distribution */}
              <div className="card">
                <h3 className="card-title"><Sprout size={18} /> Crop Distribution</h3>
                <p className="card-sub">Active crops cultivated across FPO member lands.</p>
                
                {stats?.crop_distribution && Object.keys(stats.crop_distribution).length > 0 ? (
                  <div className="crop-grid">
                    {Object.entries(stats.crop_distribution).map(([crop, count]) => (
                      <div key={crop} className="crop-tile">
                        <span className="crop-tile-emoji">{getCropEmoji(crop)}</span>
                        <div className="crop-tile-info">
                          <div className="crop-tile-name">{crop}</div>
                          <div className="crop-tile-count">{count} farm{count > 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">No crop distribution data available.</div>
                )}
              </div>
            </div>

            {/* Farm Table Section */}
            <div className="card" style={{ marginTop: 24 }}>
              <div className="table-header-toolbar">
                <h3 className="card-title" style={{ margin: 0 }}><FileText size={18} /> Member Farms Database</h3>
                
                <div className="toolbar-controls">
                  <div className="search-box">
                    <Search size={16} />
                    <input 
                      type="text" 
                      placeholder="Search farmer, farm name..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  <div className="filter-group">
                    <button 
                      className={`filter-tab ${filterType === 'all' ? 'active' : ''}`}
                      onClick={() => setFilterType('all')}
                    >
                      All Farms
                    </button>
                    <button 
                      className={`filter-tab ${filterType === 'low' ? 'active' : ''}`}
                      onClick={() => setFilterType('low')}
                    >
                      Low Score (&lt;50)
                    </button>
                    <button 
                      className={`filter-tab ${filterType === 'good' ? 'active' : ''}`}
                      onClick={() => setFilterType('good')}
                    >
                      Good Score (70+)
                    </button>
                  </div>
                </div>
              </div>

              {filteredFarms.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Farmer Details</th>
                        <th>Farm Location</th>
                        <th>Crop</th>
                        <th>pH</th>
                        <th>Nitrogen</th>
                        <th>Phosphorus</th>
                        <th>Potassium</th>
                        <th>Organic Carbon</th>
                        <th>Nutrient Deficits</th>
                        <th>Soil Score</th>
                        <th>Last Scanned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFarms.map(f => {
                        const lowN = f.nitrogen !== null && f.nitrogen < 280;
                        const lowP = f.phosphorus !== null && f.phosphorus < 25;
                        const lowK = f.potassium !== null && f.potassium < 200;
                        const lowOC = f.organic_carbon !== null && f.organic_carbon < 0.75;
                        const alertPH = f.ph !== null && (f.ph < 6 || f.ph > 8);

                        return (
                          <tr key={f.farm_id}>
                            <td>
                              <div className="farmer-name">{f.farmer_name || '—'}</div>
                              <div className="farmer-phone"><Phone size={10} /> +91 {f.farmer_phone || ''}</div>
                            </td>
                            <td>
                              <div className="farm-name">{f.farm_name || '—'}</div>
                              <div className="farm-location"><MapPin size={10} /> {f.district || 'Nagpur'}, {f.state || 'MH'}</div>
                            </td>
                            <td>
                              <span className="crop-pill">
                                {getCropEmoji(f.crop)} {f.crop || 'Unassigned'}
                              </span>
                            </td>
                            <td className={alertPH ? 'text-alert' : ''}>{f.ph !== null ? Number(f.ph).toFixed(1) : '—'}</td>
                            <td className={lowN ? 'text-alert' : ''}>{f.nitrogen !== null ? Math.round(f.nitrogen) : '—'}</td>
                            <td className={lowP ? 'text-alert' : ''}>{f.phosphorus !== null ? Math.round(f.phosphorus) : '—'}</td>
                            <td className={lowK ? 'text-alert' : ''}>{f.potassium !== null ? Math.round(f.potassium) : '—'}</td>
                            <td className={lowOC ? 'text-alert' : ''}>{f.organic_carbon !== null ? Number(f.organic_carbon).toFixed(2) : '—'}</td>
                            <td>
                              <div className="deficit-badges">
                                {lowN && <span className="deficit-badge badge-red">N↓</span>}
                                {lowP && <span className="deficit-badge badge-red">P↓</span>}
                                {lowK && <span className="deficit-badge badge-red">K↓</span>}
                                {lowOC && <span className="deficit-badge badge-red">OC↓</span>}
                                {alertPH && <span className="deficit-badge badge-orange">pH⚠</span>}
                                {!lowN && !lowP && !lowK && !lowOC && !alertPH && (
                                  <span className="deficit-badge badge-green">✓ OK</span>
                                )}
                              </div>
                            </td>
                            <td>
                              {f.soil_health_score !== null ? (
                                <span className={getScoreBadgeClass(f.soil_health_score)}>
                                  {f.soil_health_score}/100
                                </span>
                              ) : (
                                <span className="score-badge score-none">—</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {f.scanned_at 
                                ? new Date(f.scanned_at).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: '2-digit'
                                  })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="table-empty-state">
                  <Search size={32} />
                  <p>No member farms match the active filter or search term.</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Add Farmer Modal Overlay */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card-container animate-fade-in">
            <div className="modal-header">
              <h3 className="modal-title">Add Farmer to FPO</h3>
              <button onClick={() => setShowAddModal(false)} className="modal-close-btn">&times;</button>
            </div>
            
            <p className="modal-description">
              Select a farm registered in Nagpur district to add them to your FPO member registry.
            </p>

            <div className="modal-body">
              {modalLoading ? (
                <div className="modal-loading">
                  <Loader2 className="spinner-icon" />
                  <p>Searching district database...</p>
                </div>
              ) : districtFarms.length > 0 ? (
                <div className="modal-list">
                  {districtFarms.map(f => (
                    <div key={f.farm_id} className="modal-list-item">
                      <div>
                        <div className="modal-farm-name">{f.farm_name || 'Farm'}</div>
                        <div className="modal-farmer-details">
                          👤 {f.farmer_name || '—'} &nbsp;&bull;&nbsp; 📞 +91 {f.farmer_phone || '—'}
                        </div>
                      </div>
                      
                      {f.already_added ? (
                        <span className="status-added">✓ Added</span>
                      ) : (
                        <button 
                          onClick={() => handleAddFarm(f.farm_id)}
                          className="btn btn-primary btn-sm"
                          disabled={addingFarmId === f.farm_id}
                        >
                          {addingFarmId === f.farm_id ? '...' : '+ Add'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="modal-empty-state">
                  <Users size={32} />
                  <p>No non-member farms found in Nagpur district.</p>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowAddModal(false)} className="btn btn-logout">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
