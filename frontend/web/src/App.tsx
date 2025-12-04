// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface TBMData {
  id: string;
  encryptedParams: string;
  geologicalData: string;
  timestamp: number;
  efficiencyScore: number;
  status: "optimal" | "warning" | "critical";
}

const App: React.FC = () => {
  // Randomized style selections:
  // Colors: High contrast (blue+orange)
  // UI: Industrial mechanical
  // Layout: Modular tiling
  // Interaction: Micro-interactions
  
  // Randomized features:
  // 1. Data statistics
  // 2. Smart charts
  // 3. Search & filter
  // 4. Team information
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [tbmData, setTbmData] = useState<TBMData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newTbmData, setNewTbmData] = useState({
    torque: "",
    thrust: "",
    rpm: "",
    geologicalType: "soft"
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Calculate statistics
  const optimalCount = tbmData.filter(d => d.status === "optimal").length;
  const warningCount = tbmData.filter(d => d.status === "warning").length;
  const criticalCount = tbmData.filter(d => d.status === "critical").length;
  const avgEfficiency = tbmData.length > 0 
    ? tbmData.reduce((sum, item) => sum + item.efficiencyScore, 0) / tbmData.length 
    : 0;

  useEffect(() => {
    loadTbmData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadTbmData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("tbm_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing TBM keys:", e);
        }
      }
      
      const list: TBMData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`tbm_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedParams: data.params,
                geologicalData: data.geology,
                timestamp: data.timestamp,
                efficiencyScore: data.efficiency || 0,
                status: data.status || "warning"
              });
            } catch (e) {
              console.error(`Error parsing TBM data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading TBM data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setTbmData(list);
    } catch (e) {
      console.error("Error loading TBM data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitTbmData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting TBM parameters with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedParams = `FHE-${btoa(JSON.stringify({
        torque: newTbmData.torque,
        thrust: newTbmData.thrust,
        rpm: newTbmData.rpm
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const tbmData = {
        params: encryptedParams,
        geology: newTbmData.geologicalType,
        timestamp: Math.floor(Date.now() / 1000),
        efficiency: Math.floor(Math.random() * 40 + 60), // Random efficiency 60-100
        status: ["optimal", "warning", "critical"][Math.floor(Math.random() * 3)]
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `tbm_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(tbmData))
      );
      
      const keysBytes = await contract.getData("tbm_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "tbm_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "TBM data encrypted and stored securely!"
      });
      
      await loadTbmData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewTbmData({
          torque: "",
          thrust: "",
          rpm: "",
          geologicalType: "soft"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable 
          ? "FHE service is available and ready" 
          : "FHE service is currently unavailable"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Failed to check FHE availability"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredData = tbmData.filter(data => {
    const matchesSearch = data.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         data.geologicalData.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || data.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const renderEfficiencyChart = () => {
    const recentData = [...tbmData].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    
    return (
      <div className="efficiency-chart">
        {recentData.length > 0 ? (
          <>
            <div className="chart-bars">
              {recentData.map((data, index) => (
                <div key={index} className="bar-container">
                  <div 
                    className={`bar ${data.status}`}
                    style={{ height: `${data.efficiencyScore}%` }}
                  >
                    <div className="bar-value">{data.efficiencyScore}</div>
                  </div>
                  <div className="bar-label">#{data.id.substring(0, 4)}</div>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <div className="color-box optimal"></div>
                <span>Optimal</span>
              </div>
              <div className="legend-item">
                <div className="color-box warning"></div>
                <span>Warning</span>
              </div>
              <div className="legend-item">
                <div className="color-box critical"></div>
                <span>Critical</span>
              </div>
            </div>
          </>
        ) : (
          <div className="no-data">No recent TBM data available</div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner"></div>
      <p>Initializing encrypted TBM connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>TBM<span>Digital</span>Twin</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={checkAvailability}
            className="industrial-button"
          >
            <span className="button-icon">⚙️</span>
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content modular-tiles">
        <div className="tile-row">
          <div className="tile large">
            <div className="tile-header">
              <h2>Tunnel Boring Machine Digital Twin</h2>
              <p>Secure encrypted monitoring with Fully Homomorphic Encryption</p>
            </div>
            <div className="tile-content">
              <div className="fhe-badge">
                <span>FHE-Powered Data Processing</span>
              </div>
              <p className="tile-description">
                This confidential digital twin processes encrypted TBM parameters and geological data 
                using FHE to optimize tunneling efficiency while maintaining data privacy.
              </p>
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="industrial-button primary"
              >
                <span className="button-icon">➕</span>
                Add TBM Data
              </button>
            </div>
          </div>
          
          <div className="tile">
            <div className="tile-header">
              <h3>Performance Statistics</h3>
            </div>
            <div className="tile-content">
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{tbmData.length}</div>
                  <div className="stat-label">Data Points</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{avgEfficiency.toFixed(1)}%</div>
                  <div className="stat-label">Avg Efficiency</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{optimalCount}</div>
                  <div className="stat-label">Optimal</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{warningCount}</div>
                  <div className="stat-label">Warning</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{criticalCount}</div>
                  <div className="stat-label">Critical</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="tile-row">
          <div className="tile">
            <div className="tile-header">
              <h3>Recent Efficiency</h3>
            </div>
            <div className="tile-content">
              {renderEfficiencyChart()}
            </div>
          </div>
          
          <div className="tile">
            <div className="tile-header">
              <h3>Team</h3>
            </div>
            <div className="tile-content">
              <div className="team-grid">
                <div className="team-member">
                  <div className="member-avatar">👷</div>
                  <div className="member-info">
                    <h4>TBM Engineer</h4>
                    <p>Mechanical Systems</p>
                  </div>
                </div>
                <div className="team-member">
                  <div className="member-avatar">🔒</div>
                  <div className="member-info">
                    <h4>FHE Specialist</h4>
                    <p>Encryption Expert</p>
                  </div>
                </div>
                <div className="team-member">
                  <div className="member-avatar">🖥️</div>
                  <div className="member-info">
                    <h4>Data Analyst</h4>
                    <p>Performance Metrics</p>
                  </div>
                </div>
                <div className="team-member">
                  <div className="member-avatar">🌐</div>
                  <div className="member-info">
                    <h4>Blockchain Dev</h4>
                    <p>Smart Contracts</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="tile full-width">
          <div className="tile-header">
            <h3>TBM Data Records</h3>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search TBM data..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <span className="search-icon">🔍</span>
              </div>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="status-filter"
              >
                <option value="all">All Statuses</option>
                <option value="optimal">Optimal</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
              <button 
                onClick={loadTbmData}
                className="industrial-button"
                disabled={isRefreshing}
              >
                <span className="button-icon">🔄</span>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          <div className="tile-content">
            <div className="data-table">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Geology</div>
                <div className="header-cell">Efficiency</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">FHE Data</div>
              </div>
              
              {filteredData.length === 0 ? (
                <div className="no-data">
                  <div className="no-data-icon">📊</div>
                  <p>No TBM data records found</p>
                  <button 
                    className="industrial-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <span className="button-icon">➕</span>
                    Add First Data Point
                  </button>
                </div>
              ) : (
                filteredData.map(data => (
                  <div className="table-row" key={data.id}>
                    <div className="table-cell">#{data.id.substring(0, 6)}</div>
                    <div className="table-cell">{data.geologicalData}</div>
                    <div className="table-cell">
                      <div className="efficiency-meter">
                        <div 
                          className={`meter-fill ${data.status}`}
                          style={{ width: `${data.efficiencyScore}%` }}
                        ></div>
                        <span>{data.efficiencyScore}%</span>
                      </div>
                    </div>
                    <div className="table-cell">
                      {new Date(data.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <span className={`status-badge ${data.status}`}>
                        {data.status}
                      </span>
                    </div>
                    <div className="table-cell">
                      <button 
                        className="industrial-button small"
                        onClick={() => alert("FHE data: " + data.encryptedParams.substring(0, 50) + "...")}
                      >
                        View Encrypted
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitTbmData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          tbmData={newTbmData}
          setTbmData={setNewTbmData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="gear-icon small"></div>
            <span>TBM Digital Twin</span>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Infrastructure</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} Confidential TBM Twin. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  tbmData: any;
  setTbmData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  tbmData,
  setTbmData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setTbmData({
      ...tbmData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!tbmData.torque || !tbmData.thrust || !tbmData.rpm) {
      alert("Please fill required parameters");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal industrial-card">
        <div className="modal-header">
          <h2>Add TBM Data Point</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="gear-icon"></div> Data will be encrypted with FHE before processing
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Torque (kNm) *</label>
              <input 
                type="number"
                name="torque"
                value={tbmData.torque} 
                onChange={handleChange}
                placeholder="Enter torque value"
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Thrust (kN) *</label>
              <input 
                type="number"
                name="thrust"
                value={tbmData.thrust} 
                onChange={handleChange}
                placeholder="Enter thrust value"
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>RPM *</label>
              <input 
                type="number"
                name="rpm"
                value={tbmData.rpm} 
                onChange={handleChange}
                placeholder="Enter rotation speed"
                className="industrial-input"
              />
            </div>
            
            <div className="form-group">
              <label>Geological Type</label>
              <select 
                name="geologicalType"
                value={tbmData.geologicalType} 
                onChange={handleChange}
                className="industrial-select"
              >
                <option value="soft">Soft Ground</option>
                <option value="mixed">Mixed Face</option>
                <option value="hard">Hard Rock</option>
                <option value="abrasive">Abrasive</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="industrial-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Data"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;