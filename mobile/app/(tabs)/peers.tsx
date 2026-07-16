import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  ScrollView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Rect } from 'react-native-svg';
import AnimatedQRCode from '../../src/components/AnimatedQRCode';
import { useSignal } from '../../src/context/SignalContext';
import CameraScanner from '../../src/components/CameraScanner';

export default function PeersTab() {
  const { 
    identity, 
    peers, 
    statuses, 
    updateStatus, 
    peerTrustStates, 
    verifyPeerFingerprint,
    createManualOffer,
    acceptManualOffer,
    completeManualConnection
  } = useSignal();

  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'invite' | 'join'>('invite');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [tempId, setTempId] = useState('');
  const [offerString, setOfferString] = useState('');
  const [answerString, setAnswerString] = useState('');
  const [manualCodeInput, setManualCodeInput] = useState('');
  
  const [showScanner, setShowScanner] = useState(false);
  const [hasGeneratedInvite, setHasGeneratedInvite] = useState(false);

  const handleCheckIn = async (status: 'safe' | 'need-help' | 'unknown') => {
    try {
      await updateStatus(status);
      Alert.alert('Status Sync', `Checked in successfully as ${status.toUpperCase()}`);
    } catch (e: any) {
      Alert.alert('Error', `Failed to check in: ${e.message}`);
    }
  };

  const handleGenerateInvite = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await createManualOffer();
      setTempId(res.tempId);
      setOfferString(res.offerString);
      setHasGeneratedInvite(true);
      setSuccess('Invite generated! Share QR or save file.');
    } catch (err: any) {
      setError(err.message || 'Failed to generate invite');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFile = async (fileName: string, content: string) => {
    try {
      const fileUri = `${(FileSystem as any).documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/octet-stream', dialogTitle: `Save ${fileName}` });
        setSuccess(`${fileName} shared successfully!`);
      } else {
        Alert.alert('Saved Local', `File saved to document directory. Uri: ${fileUri}`);
      }
    } catch (err: any) {
      setError(`Failed to save file: ${err.message}`);
    }
  };

  const handleImportFile = async (type: 'invite' | 'answer') => {
    setError(null);
    setSuccess(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setError('No file selected.');
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });

      if (type === 'invite') {
        await handleProcessInviteCode(fileContent.trim());
      } else {
        await handleProcessAnswerCode(fileContent.trim());
      }
    } catch (err: any) {
      setError(`Failed to read file: ${err.message}`);
    }
  };

  const handleProcessInviteCode = async (code: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await acceptManualOffer(code.trim());
      setAnswerString(res.answerString);
      setSuccess(`Invite processed! Return the generated Answer back to ${res.displayName}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to process invite');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessAnswerCode = async (code: string) => {
    if (!tempId) {
      setError('No pending invitation. Please generate an invite first.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await completeManualConnection(tempId, code.trim());
      setSuccess('P2P Connection successfully established!');
      setTempId('');
      setHasGeneratedInvite(false);
      setOfferString('');
      setAnswerString('');
      setManualCodeInput('');
      setTimeout(() => setShowModal(false), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to complete connection');
    } finally {
      setLoading(false);
    }
  };

  const handleCameraScan = (data: string) => {
    setShowScanner(false);
    if (activeTab === 'invite') {
      handleProcessAnswerCode(data);
    } else {
      handleProcessInviteCode(data);
    }
  };

  return (
    <View style={styles.container}>
      
      {}
      <View style={styles.actionHeader}>
        <Text style={styles.sectionTitle}>MESH MEMBERS ({peers.length})</Text>
        <TouchableOpacity style={styles.connectBtn} onPress={() => setShowModal(true)}>
          <Ionicons name="qr-code" size={14} color="#4A9B6E" />
          <Text style={styles.connectBtnText}>OFFLINE CONNECT</Text>
        </TouchableOpacity>
      </View>

      {}
      <FlatList
        data={peers}
        keyExtractor={item => item.id}
        style={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <Ionicons name="wifi-outline" size={40} color="rgba(139, 149, 165, 0.3)" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyText}>No mesh active nodes connected.</Text>
            <Text style={styles.emptySubtext}>Use Offline Connect above to exchange keys.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const trust = peerTrustStates[item.id];
          const isConnected = item.status === 'connected';

          return (
            <View style={styles.peerCard}>
              <View style={styles.peerInfo}>
                <Ionicons 
                  name={isConnected ? "ellipse" : "ellipse-outline"} 
                  size={10} 
                  color={isConnected ? "#4A9B6E" : "#C45B5B"} 
                  style={{ marginRight: 10 }}
                />
                <View>
                  <Text style={styles.peerName}>{item.display_name}</Text>
                  <Text style={styles.peerId}>{item.id.substring(0, 8)}</Text>
                </View>
              </View>
              
              {isConnected && (
                <TouchableOpacity 
                  onPress={() => {
                    Alert.alert(
                      'Verify Peer Identity',
                      `Peer: ${item.display_name}\nID: ${item.id}\nFingerprint: ${trust?.fingerprint || 'N/A'}\n\nTrust this fingerprint?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Verify / Trust', 
                          onPress: () => verifyPeerFingerprint(item.id, trust?.fingerprint || '') 
                        }
                      ]
                    );
                  }}
                  style={styles.verifyBtn}
                >
                  <Ionicons 
                    name={trust?.trusted ? "shield-checkmark" : "shield-outline"} 
                    size={16} 
                    color={trust?.trusted ? "#4A9B6E" : "#E5A83B"} 
                  />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Check In Panel */}
      <View style={styles.checkinPanel}>
        <Text style={styles.checkinTitle}>MY SAFETY STATUS BOARD</Text>
        <View style={styles.checkinRow}>
          <TouchableOpacity 
            style={[styles.checkinBtn, { backgroundColor: 'rgba(74, 155, 110, 0.15)', borderColor: '#4A9B6E' }]} 
            onPress={() => handleCheckIn('safe')}
          >
            <Ionicons name="checkmark-circle" size={16} color="#4A9B6E" />
            <Text style={[styles.checkinBtnText, { color: '#4A9B6E' }]}>SAFE</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.checkinBtn, { backgroundColor: 'rgba(229, 168, 59, 0.15)', borderColor: '#E5A83B' }]} 
            onPress={() => handleCheckIn('need-help')}
          >
            <Ionicons name="warning" size={16} color="#E5A83B" />
            <Text style={[styles.checkinBtnText, { color: '#E5A83B' }]}>NEED HELP</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.checkinBtn, { backgroundColor: 'rgba(139, 149, 165, 0.15)', borderColor: '#8B95A5' }]} 
            onPress={() => handleCheckIn('unknown')}
          >
            <Ionicons name="help-circle" size={16} color="#8B95A5" />
            <Text style={[styles.checkinBtnText, { color: '#8B95A5' }]}>UNKNOWN</Text>
          </TouchableOpacity>
        </View>
      </View>

      {}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          {showScanner ? (
            <CameraScanner
              onScan={handleCameraScan}
              onClose={() => setShowScanner(false)}
            />
          ) : (
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>OFFLINE CONNECTION SETUP</Text>
                <TouchableOpacity onPress={() => {
                  setShowModal(false);
                  setError(null);
                  setSuccess(null);
                  setOfferString('');
                  setAnswerString('');
                  setHasGeneratedInvite(false);
                }}>
                  <Ionicons name="close" size={24} color="#8B95A5" />
                </TouchableOpacity>
              </View>

              {/* Modal Tabs */}
              <View style={styles.modalTabs}>
                <TouchableOpacity 
                  style={[styles.modalTab, activeTab === 'invite' && styles.modalTabActive]}
                  onPress={() => { setActiveTab('invite'); setError(null); setSuccess(null); }}
                >
                  <Text style={[styles.modalTabText, activeTab === 'invite' && styles.modalTabTextActive]}>1. INVITE FRIEND</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalTab, activeTab === 'join' && styles.modalTabActive]}
                  onPress={() => { setActiveTab('join'); setError(null); setSuccess(null); }}
                >
                  <Text style={[styles.modalTabText, activeTab === 'join' && styles.modalTabTextActive]}>2. JOIN FRIEND</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                {error && <Text style={styles.errorText}>⚠️ {error}</Text>}
                {success && <Text style={styles.successText}>✅ {success}</Text>}

                {activeTab === 'invite' ? (
                  <View style={styles.formSection}>
                    <Text style={styles.helpText}>
                      Generate an invite QR code or file, send it to a friend, and load their generated answer connection string.
                    </Text>

                    {!hasGeneratedInvite ? (
                      <TouchableOpacity style={styles.primaryBtn} onPress={handleGenerateInvite} disabled={loading}>
                        <Text style={styles.primaryBtnText}>GENERATE INVITE CODE</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.formContainer}>
                        {offerString ? (
                          <View style={styles.qrContainer}>
                            <AnimatedQRCode value={offerString} size={150} />
                          </View>
                        ) : null}

                        <TouchableOpacity 
                          style={styles.secondaryBtn} 
                          onPress={() => handleSaveFile('signum_invite.sig', offerString)}
                        >
                          <Ionicons name="share-social" size={16} color="#E8ECF1" />
                          <Text style={styles.secondaryBtnText}>Save Invite File (.sig)</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <Text style={styles.label}>IMPORT FRIEND'S ANSWER</Text>
                        
                        <View style={styles.rowButtons}>
                          <TouchableOpacity style={styles.scannerBtn} onPress={() => setShowScanner(true)}>
                            <Ionicons name="camera" size={16} color="#4A9B6E" />
                            <Text style={styles.scannerBtnText}>Scan Answer QR</Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity style={styles.fileBtn} onPress={() => handleImportFile('answer')}>
                            <Ionicons name="document-attach" size={16} color="#E8ECF1" />
                            <Text style={styles.fileBtnText}>Import File (.sig)</Text>
                          </TouchableOpacity>
                        </View>

                        <TextInput
                          style={styles.inputAreaText}
                          placeholder="Or paste friend's answer string code here..."
                          placeholderTextColor="rgba(139, 149, 165, 0.4)"
                          multiline={true}
                          value={manualCodeInput}
                          onChangeText={setManualCodeInput}
                        />

                        {manualCodeInput.trim() ? (
                          <TouchableOpacity 
                            style={styles.primaryBtn} 
                            onPress={() => handleProcessAnswerCode(manualCodeInput)}
                          >
                            <Text style={styles.primaryBtnText}>PROCESS ANSWER CODE</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.formSection}>
                    <Text style={styles.helpText}>
                      Load a friend's invite to join their connection, then export and share the generated answer back.
                    </Text>

                    {!answerString ? (
                      <View style={styles.formContainer}>
                        <View style={styles.rowButtons}>
                          <TouchableOpacity style={styles.scannerBtn} onPress={() => setShowScanner(true)}>
                            <Ionicons name="camera" size={16} color="#4A9B6E" />
                            <Text style={styles.scannerBtnText}>Scan Invite QR</Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity style={styles.fileBtn} onPress={() => handleImportFile('invite')}>
                            <Ionicons name="document-attach" size={16} color="#E8ECF1" />
                            <Text style={styles.fileBtnText}>Import File (.sig)</Text>
                          </TouchableOpacity>
                        </View>

                        <TextInput
                          style={styles.inputAreaText}
                          placeholder="Or paste friend's invite string code here..."
                          placeholderTextColor="rgba(139, 149, 165, 0.4)"
                          multiline={true}
                          value={manualCodeInput}
                          onChangeText={setManualCodeInput}
                        />

                        {manualCodeInput.trim() ? (
                          <TouchableOpacity 
                            style={styles.primaryBtn} 
                            onPress={() => handleProcessInviteCode(manualCodeInput)}
                          >
                            <Text style={styles.primaryBtnText}>PROCESS INVITE CODE</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.formContainer}>
                        {answerString ? (
                          <View style={styles.qrContainer}>
                            <AnimatedQRCode value={answerString} size={150} />
                          </View>
                        ) : null}

                        <TouchableOpacity 
                          style={styles.secondaryBtn} 
                          onPress={() => handleSaveFile('signum_answer.sig', answerString)}
                        >
                          <Ionicons name="share-social" size={16} color="#E8ECF1" />
                          <Text style={styles.secondaryBtnText}>Save Answer File (.sig)</Text>
                        </TouchableOpacity>

                        <Text style={styles.infoFooterText}>
                          👉 Present this QR to your friend or send the file back to complete the WebRTC handshake.
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E2328',
  },
  actionHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#3A424D',
  },
  sectionTitle: {
    color: '#8B95A5',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#4A9B6E',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  connectBtnText: {
    color: '#4A9B6E',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  list: {
    flex: 1,
  },
  peerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2A3038',
    padding: 14,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(58, 66, 77, 0.4)',
  },
  peerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peerName: {
    color: '#E8ECF1',
    fontWeight: 'bold',
    fontSize: 13,
  },
  peerId: {
    color: '#8B95A5',
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  verifyBtn: {
    padding: 6,
  },
  emptyView: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#E8ECF1',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#8B95A5',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
  checkinPanel: {
    backgroundColor: '#2A3038',
    borderTopWidth: 1,
    borderTopColor: '#3A424D',
    padding: 16,
  },
  checkinTitle: {
    color: '#8B95A5',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 12,
  },
  checkinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  checkinBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  checkinBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 24, 28, 0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#2A3038',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A424D',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3A424D',
  },
  modalTitle: {
    color: '#E8ECF1',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  modalTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#3A424D',
  },
  modalTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modalTabActive: {
    borderBottomColor: '#4A9B6E',
    backgroundColor: 'rgba(74, 155, 110, 0.05)',
  },
  modalTabText: {
    color: '#8B95A5',
    fontSize: 11,
    fontWeight: 'bold',
  },
  modalTabTextActive: {
    color: '#4A9B6E',
  },
  modalBody: {
    padding: 16,
  },
  formSection: {
    gap: 16,
    paddingBottom: 24,
  },
  helpText: {
    color: '#8B95A5',
    fontSize: 11,
    lineHeight: 16,
  },
  primaryBtn: {
    backgroundColor: '#5B8DB8',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    backgroundColor: '#3A424D',
    borderWidth: 1,
    borderColor: 'rgba(139,149,165,0.4)',
    paddingVertical: 10,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  secondaryBtnText: {
    color: '#E8ECF1',
    fontWeight: 'bold',
    fontSize: 11,
  },
  formContainer: {
    gap: 12,
  },
  qrContainer: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    marginVertical: 10,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(139,149,165,0.2)',
    marginVertical: 8,
  },
  label: {
    color: 'rgba(232, 236, 241, 0.6)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  scannerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4A9B6E',
    backgroundColor: 'rgba(74, 155, 110, 0.05)',
    paddingVertical: 10,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  scannerBtnText: {
    color: '#4A9B6E',
    fontSize: 11,
    fontWeight: 'bold',
  },
  fileBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3A424D',
    backgroundColor: 'rgba(58, 66, 77, 0.3)',
    paddingVertical: 10,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  fileBtnText: {
    color: '#E8ECF1',
    fontSize: 11,
    fontWeight: 'bold',
  },
  inputAreaText: {
    backgroundColor: '#1E2328',
    color: '#E8ECF1',
    borderWidth: 1,
    borderColor: '#3A424D',
    borderRadius: 6,
    padding: 10,
    height: 60,
    fontSize: 11,
    fontFamily: 'monospace',
    textAlignVertical: 'top',
  },
  infoFooterText: {
    color: '#8B95A5',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 4,
  },
  errorText: {
    backgroundColor: 'rgba(196, 91, 91, 0.15)',
    color: '#C45B5B',
    borderColor: 'rgba(196, 91, 91, 0.3)',
    borderWidth: 1,
    padding: 8,
    borderRadius: 4,
    fontSize: 11,
  },
  successText: {
    backgroundColor: 'rgba(74, 155, 110, 0.15)',
    color: '#4A9B6E',
    borderColor: 'rgba(74, 155, 110, 0.3)',
    borderWidth: 1,
    padding: 8,
    borderRadius: 4,
    fontSize: 11,
  },
});
