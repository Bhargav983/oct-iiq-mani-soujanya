// src/Customer/CustomerBell.js
import React, { useState } from 'react';
import { FaBell } from 'react-icons/fa';
import { useCustomerNotifications } from '../../AuthContext/CustomerNotificationContext';
import { useNavigate } from 'react-router-dom';

const statusColors = {
  'Under Process':              '#f59e0b',  // amber
  'Waiting for Spares':         '#8b5cf6',  // purple
  'Waiting for Quote':          '#3b82f6',  // blue
  'Waiting for Client Approval':'#f97316',  // orange
  'Closed':                     '#6b7280',  // gray
  'Reopened':                   '#ef4444',  // red
};

const statusIcons = {
  'Under Process':               '⚙️',
  'Waiting for Spares':          '📦',
  'Waiting for Quote':           '💬',
  'Waiting for Client Approval': '⏳',
  'Closed':                      '🔒',
  'Reopened':                    '🔄',
};

const CustomerBell = () => {
  const { unreadCount, notifications, markAsSeen } = useCustomerNotifications();
  const [open, setOpen] = useState(false);
  const navigate        = useNavigate();

  const handleBellClick = () => {
    markAsSeen();                    // clears badge immediately
    setOpen(prev => !prev);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>

      {/* ── Bell Icon + Red Badge ── */}
      <div
        style={{ position: 'relative', cursor: 'pointer' }}
        onClick={handleBellClick}
      >
        <FaBell className="top-icon" />

        {unreadCount > 0 && (
          <span style={{
            position:       'absolute',
            top:            '-6px',
            right:          '-6px',
            background:     '#ef4444',
            color:          '#fff',
            borderRadius:   '50%',
            minWidth:       '18px',
            height:         '18px',
            fontSize:       '11px',
            fontWeight:     '700',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            padding:        '0 3px',
            pointerEvents:  'none',
            border:         '2px solid #fff',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <>
          {/* Backdrop — click outside to close */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
          />

          <div style={{
            position:     'fixed',
            top:          'calc(var(--customer-safe-top, 0px) + 56px)',
            right:        '12px',
            width:        'min(340px, calc(100vw - 24px))',
            background:   '#fff',
            borderRadius: '12px',
            boxShadow:    '0 4px 24px rgba(0,0,0,0.13)',
            zIndex:       1000,
            overflow:     'hidden',
          }}>

            {/* Header */}
            <div style={{
              padding:        '14px 16px',
              borderBottom:   '1px solid #f0f0f0',
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
            }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>
                Service Request Updates
              </span>
              <span style={{
                background:   '#fee2e2',
                color:        '#ef4444',
                borderRadius: '12px',
                padding:      '2px 8px',
                fontSize:     '12px',
                fontWeight:   '600',
              }}>
                {notifications.length} requests
              </span>
            </div>

            {/* List */}
            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{
                  padding:   '32px',
                  textAlign: 'center',
                  color:     '#9ca3af',
                  fontSize:  '13px',
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔔</div>
                  No updates yet
                </div>
              ) : (
                notifications.map((req) => (
                  <div
                    key={req.request_id}
                    onClick={() => {
                      setOpen(false);
                      navigate('/request'); // your customer requests route
                    }}
                    style={{
                      padding:      '12px 16px',
                      borderBottom: '1px solid #f9fafb',
                      cursor:       'pointer',
                      background:   '#fff',
                      transition:   'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    {/* Request ID + Status pill */}
                    <div style={{
                      display:        'flex',
                      justifyContent: 'space-between',
                      alignItems:     'center',
                      marginBottom:   '4px',
                    }}>
                      <span style={{
                        fontWeight: '500',
                        fontSize:   '11px',
                        color:      '#6b7280',
                        fontFamily: 'monospace',
                      }}>
                        {req.request_id}
                      </span>

                      <span style={{
                        background:   statusColors[req.status] || '#6b7280',
                        color:        '#fff',
                        borderRadius: '12px',
                        padding:      '2px 10px',
                        fontSize:     '11px',
                        fontWeight:   '600',
                        whiteSpace:   'nowrap',
                      }}>
                        {statusIcons[req.status] || '🔔'} {req.status}
                      </span>
                    </div>

                    {/* Request details text */}
                    <div style={{
                      fontSize:     '13px',
                      color:        '#111827',
                      fontWeight:   '500',
                      marginBottom: '4px',
                      whiteSpace:   'nowrap',
                      overflow:     'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {req.request_details || 'Service Request'}
                    </div>

                    {/* Engineer + Updated time */}
                    <div style={{
                      display:  'flex',
                      gap:      '8px',
                      fontSize: '11px',
                      color:    '#9ca3af',
                    }}>
                      {req.assigned_engineer && (
                        <span>👷 {req.assigned_engineer}</span>
                      )}
                      <span>🕐 {new Date(req.updated_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div
              onClick={() => {
                setOpen(false);
                navigate('/request'); // your customer requests route
              }}
              style={{
                padding:    '11px 16px',
                textAlign:  'center',
                fontSize:   '13px',
                color:      '#3b82f6',
                cursor:     'pointer',
                fontWeight: '600',
                borderTop:  '1px solid #f0f0f0',
              }}
            >
              View all requests →
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default CustomerBell;