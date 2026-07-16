import React, { useState, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSignal } from '../../src/context/SignalContext';

export default function ChatsTab() {
  const { identity, peers, messages, sendMessage } = useSignal();
  const [selectedPeerId, setSelectedPeerId] = useState<string | 'broadcast' | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const getPeerName = (id: string) => {
    if (id === 'broadcast') return 'ALL PEERS (BROADCAST)';
    if (id === identity?.peerId) return `${identity.username} (You)`;
    const peer = peers.find(p => p.id === id);
    return peer ? peer.display_name : id.substring(0, 8);
  };

  const getLastMessage = (peerId: string | 'broadcast') => {
    const peerMsgs = messages.filter(m => 
      peerId === 'broadcast'
        ? m.recipient_id === 'broadcast'
        : (m.sender_id === peerId && m.recipient_id === identity?.peerId) ||
          (m.sender_id === identity?.peerId && m.recipient_id === peerId)
    );
    if (peerMsgs.length === 0) return 'No messages yet';
    const last = peerMsgs[peerMsgs.length - 1];
    return `${last.sender_id === identity?.peerId ? 'You: ' : ''}${last.type === 'sos' ? '🚨 SOS Check-in' : last.payload}`;
  };

  const handleSend = async (isSos = false) => {
    if (!selectedPeerId || (!inputMessage.trim() && !isSos)) return;
    const payload = isSos ? 'SOS EMERGENCY TRIGGERED' : inputMessage.trim();
    const type = isSos ? 'sos' : 'text';
    
    await sendMessage(selectedPeerId, type, payload);
    setInputMessage('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const renderConversationItem = ({ item }: { item: string | 'broadcast' }) => {
    const isBroadcast = item === 'broadcast';
    const name = getPeerName(item);
    const lastMsg = getLastMessage(item);
    const peerInfo = !isBroadcast ? peers.find(p => p.id === item) : null;
    const isOnline = isBroadcast || peerInfo?.status === 'connected';

    return (
      <TouchableOpacity 
        style={[styles.convoItem, selectedPeerId === item && styles.convoItemSelected]}
        onPress={() => setSelectedPeerId(item)}
      >
        <View style={styles.convoHeader}>
          <View style={styles.row}>
            <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.convoName} numberOfLines={1}>{name}</Text>
          </View>
          {isBroadcast && <Text style={styles.badgeSOS}>SOS</Text>}
        </View>
        <Text style={styles.convoPreview} numberOfLines={1}>{lastMsg}</Text>
      </TouchableOpacity>
    );
  };

  const activeMessages = selectedPeerId
    ? messages.filter(m => 
        selectedPeerId === 'broadcast'
          ? m.recipient_id === 'broadcast'
          : (m.sender_id === selectedPeerId && m.recipient_id === identity?.peerId) ||
            (m.sender_id === identity?.peerId && m.recipient_id === selectedPeerId)
      )
    : [];

  if (!selectedPeerId) {
    const convoList = ['broadcast', ...peers.map(p => p.id)];
    
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>CHANNELS</Text>
          {identity && (
            <Text style={styles.subtext}>MY ID: {identity.peerId.substring(0, 8)}</Text>
          )}
        </View>
        <FlatList
          data={convoList}
          keyExtractor={item => item}
          renderItem={renderConversationItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No mesh active channels. Import an invite to start.</Text>
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.chatHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedPeerId(null)}>
          <Ionicons name="arrow-back" size={20} color="#E8ECF1" />
        </TouchableOpacity>
        <View style={styles.chatHeaderInfo}>
          <Text style={styles.chatHeaderName} numberOfLines={1}>
            {getPeerName(selectedPeerId)}
          </Text>
          <Text style={styles.chatHeaderStatus}>
            {selectedPeerId === 'broadcast' ? 'MESH RELAY CHANNEL' : 'E2E SECURED'}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={activeMessages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => {
          const isSelf = item.sender_id === identity?.peerId;
          const isSos = item.type === 'sos';
          
          return (
            <View style={[styles.bubbleWrapper, isSelf ? styles.selfWrapper : styles.peerWrapper]}>
              <View style={[
                styles.bubble, 
                isSelf ? styles.selfBubble : styles.peerBubble,
                isSos && styles.sosBubble
              ]}>
                {!isSelf && <Text style={styles.bubbleSender}>{item.sender_name || item.sender_id.substring(0, 8)}</Text>}
                <Text style={[styles.bubbleText, isSos && styles.sosText]}>{item.payload}</Text>
                <Text style={styles.bubbleTime}>
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputArea}>
        {selectedPeerId === 'broadcast' && (
          <TouchableOpacity style={styles.sosButton} onPress={() => handleSend(true)}>
            <Ionicons name="warning" size={20} color="#1E2328" />
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.input}
          placeholder="Type secure message..."
          placeholderTextColor="rgba(139, 149, 165, 0.4)"
          value={inputMessage}
          onChangeText={setInputMessage}
        />
        <TouchableOpacity style={styles.sendButton} onPress={() => handleSend(false)}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E2328',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3A424D',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#8B95A5',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  subtext: {
    color: '#8B95A5',
    fontFamily: 'monospace',
    fontSize: 10,
  },
  listContainer: {
    padding: 8,
  },
  convoItem: {
    backgroundColor: '#2A3038',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  convoItemSelected: {
    borderColor: '#5B8DB8',
  },
  convoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  dotOnline: {
    backgroundColor: '#4A9B6E',
  },
  dotOffline: {
    backgroundColor: '#C45B5B',
  },
  convoName: {
    color: '#E8ECF1',
    fontWeight: 'bold',
    fontSize: 13,
    flex: 1,
  },
  convoPreview: {
    color: '#8B95A5',
    fontSize: 11,
    marginLeft: 14,
  },
  badgeSOS: {
    backgroundColor: '#E5A83B',
    color: '#1E2328',
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  emptyText: {
    color: '#8B95A5',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 40,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3A424D',
    backgroundColor: '#2A3038',
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderName: {
    color: '#E8ECF1',
    fontWeight: 'bold',
    fontSize: 13,
  },
  chatHeaderStatus: {
    color: '#4A9B6E',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
  bubbleWrapper: {
    marginBottom: 10,
    width: '100%',
    flexDirection: 'row',
  },
  selfWrapper: {
    justifyContent: 'flex-end',
  },
  peerWrapper: {
    justifyContent: 'flex-start',
  },
  bubble: {
    padding: 10,
    borderRadius: 10,
    maxWidth: '80%',
  },
  selfBubble: {
    backgroundColor: 'rgba(91, 141, 184, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 184, 0.35)',
    borderBottomRightRadius: 2,
  },
  peerBubble: {
    backgroundColor: '#3A424D',
    borderWidth: 1,
    borderColor: 'rgba(58, 66, 77, 0.5)',
    borderBottomLeftRadius: 2,
  },
  sosBubble: {
    backgroundColor: 'rgba(229, 168, 59, 0.15)',
    borderColor: '#E5A83B',
  },
  bubbleSender: {
    color: '#5B8DB8',
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  bubbleText: {
    color: '#E8ECF1',
    fontSize: 13,
  },
  sosText: {
    color: '#E5A83B',
    fontWeight: 'bold',
  },
  bubbleTime: {
    color: 'rgba(139, 149, 165, 0.5)',
    fontSize: 9,
    alignSelf: 'flex-end',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#2A3038',
    borderTopWidth: 1,
    borderTopColor: '#3A424D',
    alignItems: 'center',
    gap: 8,
  },
  sosButton: {
    backgroundColor: '#E5A83B',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#1E2328',
    color: '#E8ECF1',
    borderWidth: 1,
    borderColor: '#3A424D',
    borderRadius: 18,
    paddingHorizontal: 14,
    height: 36,
    fontSize: 13,
  },
  sendButton: {
    backgroundColor: '#5B8DB8',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
