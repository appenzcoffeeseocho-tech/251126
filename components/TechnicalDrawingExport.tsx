// ...생략 (앞부분은 그대로)
                                {/* FRONT VIEW */}
                                <div style={{ height: '50%', borderBottom: '2px solid #374151', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', position: 'relative', backgroundColor: '#fafafa', boxSizing: 'border-box' }}>
                                    <div style={{ position: 'absolute', top: '20px', left: '30px', fontSize: '14px', fontWeight: 'bold', color: '#6b7280', letterSpacing: '1px' }}>FRONT VIEW</div>
                                    <img src={`data:image/png;base64,${frontView}`} alt="Front view" style={{ maxWidth: '90%', maxHeight: '85%', objectFit: 'contain' }} />
                                </div>
                                {/* SIDE VIEW */}
                                <div style={{ height: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', position: 'relative', backgroundColor: '#fafafa', boxSizing: 'border-box' }}>
                                    <div style={{ position: 'absolute', top: '20px', left: '30px', fontSize: '14px', fontWeight: 'bold', color: '#6b7280', letterSpacing: '1px' }}>SIDE VIEW</div>
                                    <img src={`data:image/png;base64,${sideView}`} alt="Side view" style={{ maxWidth: '90%', maxHeight: '85%', objectFit: 'contain' }} />
                                </div>
// ...생략 (뒷부분은 그대로)
