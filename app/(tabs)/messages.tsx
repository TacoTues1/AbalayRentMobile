import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text, TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

const { width } = Dimensions.get('window');

export default function Messages() {
    const { isDark, colors } = useTheme();
    const [session, setSession] = useState<any>(null);
    const [profile, setProfile] = useState<any>(null);
    const [conversations, setConversations] = useState<any[]>([]);
    const [selectedConv, setSelectedConv] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Shared files panel
    const [showFilesPanel, setShowFilesPanel] = useState(false);
    const [sharedMedia, setSharedMedia] = useState<any[]>([]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
                setSession(data.session);
                loadProfile(data.session.user.id);
            }
        });
    }, []);

    const loadProfile = async (userId: string) => {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
        setProfile(data);
        if (data) {
            loadConversations(userId, data.role);
        }
    };

    const loadConversations = async (userId: string, role: string) => {
        setLoading(true);

        // 1. Fetch all existing conversations
        const { data: allConversations } = await supabase
            .from('conversations')
            .select('*, property:properties(title, address)')
            .or(`landlord_id.eq.${userId},tenant_id.eq.${userId}`);

        let existingConvs = allConversations || [];

        // 2. Auto-create for active occupancies if missing
        if (role === 'tenant') {
            let occupancy: any = null;
            const { data: directOccupancy } = await supabase
                .from('tenant_occupancies')
                .select('*, property:properties(title, landlord)')
                .eq('tenant_id', userId)
                .in('status', ['active', 'pending_end'])
                .maybeSingle();

            occupancy = directOccupancy;
            if (!occupancy) {
                try {
                    const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
                    const urlPrefix = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
                    if (urlPrefix) {
                        const res = await fetch(`${urlPrefix}/api/family-members?member_id=${userId}`);
                        if (res.ok) {
                            const fmData = await res.json();
                            if (fmData && fmData.occupancy) occupancy = fmData.occupancy;
                        }
                    }
                } catch (err) { }
            }

            if (occupancy && occupancy.landlord_id) {
                const exists = existingConvs.find(c => c.landlord_id === occupancy.landlord_id && c.tenant_id === userId);
                if (!exists) {
                    const { data: newConv } = await supabase.from('conversations')
                        .insert({ landlord_id: occupancy.landlord_id, tenant_id: userId })
                        .select('*, property:properties(title, address)')
                        .single();
                    if (newConv) existingConvs.push(newConv);
                }
            }
        } else {
            const { data: occupancies } = await supabase
                .from('tenant_occupancies')
                .select('*, property:properties(title)')
                .eq('landlord_id', userId)
                .in('status', ['active', 'pending_end']);

            if (occupancies) {
                for (const occ of occupancies) {
                    const exists = existingConvs.find(c => c.landlord_id === userId && c.tenant_id === occ.tenant_id);
                    if (!exists) {
                        const { data: newConv } = await supabase.from('conversations')
                            .insert({ landlord_id: userId, tenant_id: occ.tenant_id })
                            .select('*, property:properties(title, address)')
                            .single();
                        if (newConv) existingConvs.push(newConv);
                    }
                }
            }
        }

        // 3. Filter hidden
        existingConvs = existingConvs.filter((conv: any) => {
            const isLandlord = conv.landlord_id === userId;
            const isTenant = conv.tenant_id === userId;
            if (isLandlord && conv.hidden_by_landlord) return false;
            if (isTenant && conv.hidden_by_tenant) return false;
            return true;
        });

        if (existingConvs.length === 0) {
            setConversations([]);
            setLoading(false);
            return;
        }

        // 4. Enrich with profiles and last messages
        const userIds = new Set<string>();
        existingConvs.forEach((conv: any) => {
            userIds.add(conv.landlord_id);
            userIds.add(conv.tenant_id);
        });

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', Array.from(userIds));

        const profileMap: any = {};
        profiles?.forEach((p: any) => { profileMap[p.id] = p; });

        const enrichedConvs = await Promise.all(existingConvs.map(async (conv: any) => {
            const isLandlord = conv.landlord_id === userId;
            const otherUserId = isLandlord ? conv.tenant_id : conv.landlord_id;

            const { data: lastMsg } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            return {
                ...conv,
                otherUser: profileMap[otherUserId],
                propertyTitle: conv.property?.title || '',
                lastMessage: lastMsg || null
            };
        }));

        enrichedConvs.sort((a, b) => {
            const aTime = a.lastMessage?.created_at || a.updated_at || '';
            const bTime = b.lastMessage?.created_at || b.updated_at || '';
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });

        setConversations(enrichedConvs);
        setLoading(false);
    };

    // Mark all messages in a conversation as read for the current user
    const markAsRead = async (convId: string) => {
        if (!session?.user?.id) return;
        await supabase
            .from('messages')
            .update({ read: true })
            .eq('conversation_id', convId)
            .eq('receiver_id', session.user.id)
            .eq('read', false);
    };

    useEffect(() => {
        if (selectedConv) {
            loadMessages(selectedConv.id);
            markAsRead(selectedConv.id);
            const channel = supabase
                .channel(`chat-${selectedConv.id}`)
                .on('postgres_changes', {
                    event: 'INSERT', schema: 'public', table: 'messages',
                    filter: `conversation_id=eq.${selectedConv.id}`
                }, (payload) => {
                    setMessages(prev => [...prev, payload.new]);
                    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
                    // Mark incoming message as read since we're viewing the chat
                    markAsRead(selectedConv.id);
                })
                .subscribe();
            return () => { supabase.removeChannel(channel); };
        }
    }, [selectedConv]);

    const loadMessages = async (convId: string) => {
        const { data } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true });
        setMessages(data || []);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
    };

    const sendMessage = async (fileUrl?: string, fileType?: string, fileName?: string) => {
        if (!text.trim() && !fileUrl) return;
        if (!selectedConv?.id || !session?.user?.id) {
            Alert.alert('Error', 'No conversation or session found.');
            return;
        }
        setSending(true);
        try {
            const otherId = selectedConv.otherUser?.id || null;
            const msg: any = {
                conversation_id: selectedConv.id,
                sender_id: session.user.id,
                receiver_id: otherId,
                message: text.trim() || '',
                file_url: fileUrl || null,
                file_type: fileUrl ? (fileType || 'image') : null,
            };
            if (fileName) msg.file_name = fileName;
            const currentText = text;
            setText('');
            const { error } = await supabase.from('messages').insert(msg);
            if (error) {
                console.error('Send message error:', error);
                setText(currentText); // Restore text on failure
                Alert.alert('Send Failed', error.message || 'Could not send message.');
                setSending(false);
                return;
            }
            await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', selectedConv.id);
        } catch (err: any) {
            console.error('Send message exception:', err);
            Alert.alert('Error', 'Something went wrong sending the message.');
        }
        setSending(false);
    };

    const pickImage = async () => {
        const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            base64: true,
            quality: 0.5
        });
        if (!res.canceled && res.assets[0]) {
            const file = res.assets[0];
            const ext = file.uri.split('.').pop()?.toLowerCase() || 'jpg';
            const path = `${session.user.id}/${Date.now()}.${ext}`;
            await supabase.storage.from('chat-attachments').upload(path, decode(file.base64!), { contentType: `image/${ext}` });
            const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path);
            sendMessage(data.publicUrl, 'image');
        }
    };

    const pickFile = async () => {
        try {
            const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
            if (!res.canceled && res.assets && res.assets[0]) {
                const file = res.assets[0];
                const fileUri = file.uri;
                const fileName = file.name || `file_${Date.now()}`;
                const fileSize = file.size || 0;

                if (fileSize > 10 * 1024 * 1024) {
                    return Alert.alert('File Too Large', 'Maximum file size is 10MB.');
                }

                // Read file as base64
                const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
                const path = `${session.user.id}/${Date.now()}_${fileName}`;
                const contentType = file.mimeType || 'application/octet-stream';

                await supabase.storage.from('chat-attachments').upload(path, decode(base64), { contentType });
                const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path);
                sendMessage(data.publicUrl, 'file', fileName);
            }
        } catch (err) {
            console.error('File pick error:', err);
        }
    };

    const downloadFile = async (url: string, fileName?: string) => {
        try {
            const name = fileName || url.split('/').pop() || 'download';
            const fileUri = FileSystem.documentDirectory + name;
            const { uri } = await FileSystem.downloadAsync(url, fileUri);

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri);
            } else {
                Alert.alert('Downloaded', `File saved to ${uri}`);
            }
        } catch (err) {
            console.error('Download error:', err);
            Alert.alert('Error', 'Failed to download file.');
        }
    };

    const deleteConversation = async (convId: string) => {
        Alert.alert(
            'Delete Conversation',
            'Are you sure you want to delete this conversation? All messages will be removed.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive',
                    onPress: async () => {
                        await supabase.from('messages').delete().eq('conversation_id', convId);
                        await supabase.from('conversations').delete().eq('id', convId);
                        setConversations(prev => prev.filter(c => c.id !== convId));
                        if (selectedConv?.id === convId) setSelectedConv(null);
                    }
                }
            ]
        );
    };

    const loadSharedMedia = async (convId: string) => {
        const { data } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', convId)
            .not('file_url', 'is', null)
            .order('created_at', { ascending: false });
        setSharedMedia(data || []);
        setShowFilesPanel(true);
    };

    const getTimeAgo = (dateStr: string) => {
        if (!dateStr) return '';
        const now = new Date();
        const d = new Date(dateStr);
        const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return d.toLocaleDateString();
    };

    const getMessagePreview = (conv: any) => {
        if (!conv.lastMessage) return 'Start a conversation';
        const msg = conv.lastMessage;
        if (msg.file_url && msg.file_type?.startsWith('image')) return '📷 Photo';
        if (msg.file_url) return `📎 ${msg.file_name || 'File'}`;
        return msg.message || '';
    };

    const renderAvatar = (user: any, size: number = 48) => {
        if (user?.avatar_url) {
            return (
                <Image source={{ uri: user.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
            );
        }
        return (
            <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2 }]}>
                <Text style={[styles.avatarLetter, { fontSize: size * 0.4 }]}>
                    {user?.first_name?.[0]?.toUpperCase() || '?'}
                </Text>
            </View>
        );
    };

    // ===================== CHAT VIEW =====================
    if (selectedConv) {
        return (
            <SafeAreaView style={[styles.chatContainer, { backgroundColor: isDark ? colors.background : '#f9fafb' }]} edges={['top']}>
                <View style={{ flex: 1, marginBottom: 100 }}>
                    {/* Chat Header */}
                    <View style={[styles.chatHeader, { backgroundColor: isDark ? colors.surface : 'white', borderBottomColor: isDark ? colors.border : '#f3f4f6' }]}>
                        <TouchableOpacity onPress={() => setSelectedConv(null)} style={[styles.chatBackBtn, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                            <Ionicons name="arrow-back" size={22} color={isDark ? colors.text : '#111'} />
                        </TouchableOpacity>
                        <View style={styles.chatHeaderUser}>
                            {renderAvatar(selectedConv.otherUser, 38)}
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.chatHeaderName, { color: isDark ? colors.text : '#111' }]} numberOfLines={1}>
                                    {selectedConv.otherUser?.first_name} {selectedConv.otherUser?.last_name}
                                </Text>
                                {selectedConv.propertyTitle && (
                                    <Text style={[styles.chatHeaderProp, { color: isDark ? colors.textMuted : '#9ca3af' }]} numberOfLines={1}>
                                        {selectedConv.propertyTitle}
                                    </Text>
                                )}
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                            <TouchableOpacity onPress={() => loadSharedMedia(selectedConv.id)} style={[styles.chatHeaderAction, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                                <Ionicons name="folder-outline" size={20} color={isDark ? colors.textSecondary : '#666'} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteConversation(selectedConv.id)} style={[styles.chatHeaderAction, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Messages */}
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={i => i.id}
                        contentContainerStyle={styles.messageList}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item, index }) => {
                            const isMe = item.sender_id === session.user.id;
                            const showDate = index === 0 ||
                                new Date(item.created_at).toDateString() !==
                                new Date(messages[index - 1]?.created_at).toDateString();

                            return (
                                <>
                                    {showDate && (
                                        <View style={styles.dateSeparator}>
                                            <View style={styles.dateLine} />
                                            <Text style={styles.dateText}>
                                                {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </Text>
                                            <View style={styles.dateLine} />
                                        </View>
                                    )}
                                    <View style={[styles.msgRow, isMe && { justifyContent: 'flex-end' }]}>
                                        {!isMe && (
                                            <View style={{ marginRight: 8 }}>
                                                {renderAvatar(selectedConv.otherUser, 28)}
                                            </View>
                                        )}
                                        <View style={[styles.msgBubble, isMe ? styles.msgMe : [styles.msgOther, isDark && { backgroundColor: colors.card, borderColor: colors.cardBorder }]]}>
                                            {item.file_url && item.file_type?.startsWith('image') ? (
                                                <TouchableOpacity onPress={() => downloadFile(item.file_url, 'photo.jpg')}>
                                                    <Image source={{ uri: item.file_url }} style={styles.msgImage} />
                                                    <View style={styles.downloadOverlay}>
                                                        <Ionicons name="download-outline" size={16} color="white" />
                                                    </View>
                                                </TouchableOpacity>
                                            ) : item.file_url ? (
                                                <TouchableOpacity onPress={() => downloadFile(item.file_url, item.file_name)} style={styles.fileMsg}>
                                                    <View style={styles.fileIconBox}>
                                                        <Ionicons name="document-outline" size={22} color="#6366f1" />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.fileName, isMe && { color: '#e0e7ff' }, !isMe && isDark && { color: colors.text }]} numberOfLines={1}>
                                                            {item.file_name || 'File'}
                                                        </Text>
                                                        <Text style={[styles.fileTap, isMe && { color: 'rgba(255,255,255,0.5)' }]}>Tap to download</Text>
                                                    </View>
                                                    <Ionicons name="download-outline" size={18} color={isMe ? 'rgba(255,255,255,0.7)' : '#6366f1'} />
                                                </TouchableOpacity>
                                            ) : (
                                                <Text style={[styles.msgText, isMe ? styles.textMe : [styles.textOther, isDark && { color: colors.text }]]}>{item.message}</Text>
                                            )}
                                            <Text style={[styles.msgTime, isMe ? styles.timeMe : styles.timeOther]}>
                                                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </View>
                                    </View>
                                </>
                            );
                        }}
                    />

                    {/* Input Bar */}
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                        <View style={[styles.inputBar, { backgroundColor: isDark ? colors.surface : 'white', borderTopColor: isDark ? colors.border : '#f3f4f6' }]}>
                            <TouchableOpacity onPress={pickFile} style={[styles.inputAction, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                                <Ionicons name="attach-outline" size={22} color={isDark ? colors.textSecondary : '#9ca3af'} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={pickImage} style={[styles.inputAction, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                                <Ionicons name="image-outline" size={22} color={isDark ? colors.textSecondary : '#9ca3af'} />
                            </TouchableOpacity>
                            <TextInput
                                style={[styles.textInput, { backgroundColor: isDark ? colors.card : '#f3f4f6', color: isDark ? colors.text : '#111' }]}
                                value={text}
                                onChangeText={setText}
                                placeholder="Type a message..."
                                placeholderTextColor={isDark ? colors.textMuted : '#c4c4c4'}
                                multiline
                            />
                            <TouchableOpacity
                                onPress={() => sendMessage()}
                                disabled={sending || !text.trim()}
                                style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
                            >
                                {sending ? (
                                    <ActivityIndicator color="white" size="small" />
                                ) : (
                                    <Ionicons name="send" size={18} color="white" />
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>

                {/* Shared Files Panel */}
                <Modal visible={showFilesPanel} animationType="slide" presentationStyle="pageSheet">
                    <SafeAreaView style={[styles.filesPanelContainer, { backgroundColor: isDark ? colors.background : 'white' }]}>
                        <View style={[styles.filesPanelHeader, { borderBottomColor: isDark ? colors.border : '#f3f4f6' }]}>
                            <Text style={[styles.filesPanelTitle, { color: isDark ? colors.text : '#111' }]}>Shared Files & Photos</Text>
                            <TouchableOpacity onPress={() => setShowFilesPanel(false)} style={[styles.filesPanelClose, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                                <Ionicons name="close" size={22} color={isDark ? colors.textMuted : '#666'} />
                            </TouchableOpacity>
                        </View>

                        {sharedMedia.length === 0 ? (
                            <View style={styles.emptyFiles}>
                                <View style={[styles.emptyFilesIcon, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                                    <Ionicons name="folder-open-outline" size={40} color={isDark ? colors.textMuted : '#d1d5db'} />
                                </View>
                                <Text style={[styles.emptyFilesTitle, { color: isDark ? colors.text : '#111' }]}>No shared files yet</Text>
                                <Text style={[styles.emptyFilesSub, { color: isDark ? colors.textMuted : '#9ca3af' }]}>Photos and files shared in this conversation will appear here.</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={sharedMedia}
                                keyExtractor={i => i.id}
                                contentContainerStyle={{ padding: 16 }}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        onPress={() => downloadFile(item.file_url, item.file_name)}
                                        style={[styles.sharedFileItem, { borderBottomColor: isDark ? colors.border : '#f9fafb' }]}
                                    >
                                        {item.file_type?.startsWith('image') ? (
                                            <Image source={{ uri: item.file_url }} style={styles.sharedFileThumb} />
                                        ) : (
                                            <View style={[styles.sharedFileThumb, styles.sharedFileIcon, isDark && { backgroundColor: 'rgba(99,102,241,0.15)' }]}>
                                                <Ionicons name="document-outline" size={24} color="#6366f1" />
                                            </View>
                                        )}
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.sharedFileName, { color: isDark ? colors.text : '#111' }]} numberOfLines={1}>
                                                {item.file_type?.startsWith('image') ? 'Photo' : (item.file_name || 'File')}
                                            </Text>
                                            <Text style={[styles.sharedFileDate, { color: isDark ? colors.textMuted : '#9ca3af' }]}>
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </Text>
                                        </View>
                                        <View style={[styles.sharedFileDownload, isDark && { backgroundColor: 'rgba(99,102,241,0.15)' }]}>
                                            <Ionicons name="download-outline" size={18} color="#6366f1" />
                                        </View>
                                    </TouchableOpacity>
                                )}
                            />
                        )}
                    </SafeAreaView>
                </Modal>
            </SafeAreaView>
        );
    }

    // ===================== CONVERSATION LIST VIEW =====================
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : '#f9fafb' }]} edges={['top']}>
            {/* Page Header */}
            <View style={[styles.header, { backgroundColor: isDark ? colors.surface : 'white', borderBottomColor: isDark ? colors.border : '#f3f4f6' }]}>
                <View>
                    <Text style={[styles.headerTitle, { color: isDark ? colors.text : '#111' }]}>Messages</Text>
                    <Text style={[styles.headerSub, { color: isDark ? colors.textMuted : '#9ca3af' }]}>
                        {profile?.role === 'tenant'
                            ? 'Chat with your landlord'
                            : `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`}
                    </Text>
                </View>
                <View style={styles.headerBadge}>
                    <Ionicons name="chatbubbles" size={20} color="white" />
                </View>
            </View>

            {loading ? (
                <View style={styles.loadingBox}>
                    <ActivityIndicator size="large" color={isDark ? colors.text : '#111'} />
                    <Text style={[styles.loadingText, { color: isDark ? colors.textMuted : '#9ca3af' }]}>Loading conversations...</Text>
                </View>
            ) : conversations.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={[styles.emptyIcon, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                        <Ionicons name="chatbubble-ellipses-outline" size={48} color={isDark ? colors.textMuted : '#d1d5db'} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: isDark ? colors.text : '#111' }]}>
                        {profile?.role === 'tenant' ? 'No Landlord Found' : 'No Tenants Yet'}
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: isDark ? colors.textSecondary : '#9ca3af' }]}>
                        {profile?.role === 'tenant'
                            ? "You don't have an active rental yet. Once you're assigned to a property, you can message your landlord here."
                            : "Tenants renting your properties will appear here for messaging."}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={i => i.id}
                    contentContainerStyle={{ paddingBottom: 130 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity onPress={() => setSelectedConv(item)} style={[styles.convItem, { backgroundColor: isDark ? colors.surface : 'white', borderBottomColor: isDark ? colors.border : '#f9fafb' }]} activeOpacity={0.7}>
                            <View style={styles.convAvatarWrap}>
                                {renderAvatar(item.otherUser, 52)}
                                <View style={styles.onlineDot} />
                            </View>
                            <View style={styles.convContent}>
                                <View style={styles.convTopRow}>
                                    <Text style={[styles.convName, { color: isDark ? colors.text : '#111' }]} numberOfLines={1}>
                                        {item.otherUser?.first_name} {item.otherUser?.last_name}
                                    </Text>
                                    <Text style={styles.convTime}>
                                        {getTimeAgo(item.lastMessage?.created_at || item.updated_at)}
                                    </Text>
                                </View>
                                {item.propertyTitle && (
                                    <View style={[styles.convPropertyTag, isDark && { backgroundColor: 'rgba(99,102,241,0.15)' }]}>
                                        <Ionicons name="home-outline" size={10} color="#6366f1" />
                                        <Text style={styles.convPropertyText}>{item.propertyTitle}</Text>
                                    </View>
                                )}
                                <Text style={[styles.convPreview, { color: isDark ? colors.textMuted : '#9ca3af' }]} numberOfLines={1}>
                                    {getMessagePreview(item)}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => deleteConversation(item.id)} style={styles.convDeleteBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    )}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    // ===================== LIST VIEW =====================
    container: { flex: 1, backgroundColor: '#f9fafb' },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'white',
        borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
    },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#111' },
    headerSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
    headerBadge: {
        width: 42, height: 42, borderRadius: 14, backgroundColor: '#111',
        alignItems: 'center', justifyContent: 'center'
    },

    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 13, color: '#9ca3af' },

    // Empty State
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyIcon: {
        width: 90, height: 90, borderRadius: 45, backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20
    },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },

    // Conversation Item
    convItem: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f9fafb', gap: 14
    },
    convAvatarWrap: { position: 'relative' },
    onlineDot: {
        position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6,
        backgroundColor: '#22c55e', borderWidth: 2, borderColor: 'white'
    },
    convContent: { flex: 1 },
    convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    convName: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1, marginRight: 8 },
    convTime: { fontSize: 11, color: '#c4c4c4', fontWeight: '500' },
    convPropertyTag: {
        flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
        backgroundColor: '#eef2ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
        alignSelf: 'flex-start'
    },
    convPropertyText: { fontSize: 10, color: '#6366f1', fontWeight: '600' },
    convPreview: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
    convDeleteBtn: {
        width: 32, height: 32, borderRadius: 8, backgroundColor: '#fef2f2',
        alignItems: 'center', justifyContent: 'center'
    },

    // Avatar
    avatarCircle: {
        backgroundColor: '#111', alignItems: 'center', justifyContent: 'center',
    },
    avatarLetter: { color: 'white', fontWeight: '800' },

    // ===================== CHAT VIEW =====================
    chatContainer: { flex: 1, backgroundColor: '#f9fafb' },

    chatHeader: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 10
    },
    chatBackBtn: {
        width: 38, height: 38, borderRadius: 12, backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center'
    },
    chatHeaderUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    chatHeaderName: { fontSize: 16, fontWeight: '700', color: '#111' },
    chatHeaderProp: { fontSize: 11, color: '#9ca3af' },
    chatHeaderAction: {
        width: 36, height: 36, borderRadius: 10, backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center'
    },

    // Messages
    messageList: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 8 },
    dateSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12 },
    dateLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
    dateText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },

    msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
    msgBubble: { maxWidth: '78%', borderRadius: 18, overflow: 'hidden' },
    msgMe: {
        backgroundColor: '#111', borderBottomRightRadius: 6,
        paddingHorizontal: 14, paddingVertical: 10
    },
    msgOther: {
        backgroundColor: 'white', borderBottomLeftRadius: 6,
        paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: '#f3f4f6',
        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1
    },
    msgText: { fontSize: 15, lineHeight: 21 },
    textMe: { color: 'white' },
    textOther: { color: '#111' },
    msgTime: { fontSize: 10, marginTop: 4 },
    timeMe: { color: 'rgba(255,255,255,0.45)', textAlign: 'right' },
    timeOther: { color: '#c4c4c4' },

    msgImage: { width: 200, height: 200, borderRadius: 12 },
    downloadOverlay: {
        position: 'absolute', bottom: 8, right: 8, width: 28, height: 28,
        borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center'
    },

    // File Message
    fileMsg: {
        flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200
    },
    fileIconBox: {
        width: 40, height: 40, borderRadius: 10, backgroundColor: '#eef2ff',
        alignItems: 'center', justifyContent: 'center'
    },
    fileName: { fontSize: 13, fontWeight: '600', color: '#111' },
    fileTap: { fontSize: 10, color: '#9ca3af', marginTop: 1 },

    // Input Bar
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12,
        paddingVertical: 10, backgroundColor: 'white', borderTopWidth: 1,
        borderTopColor: '#f3f4f6', gap: 6
    },
    inputAction: {
        width: 38, height: 38, borderRadius: 12, backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center'
    },
    textInput: {
        flex: 1, maxHeight: 100, backgroundColor: '#f3f4f6', borderRadius: 20,
        paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#111'
    },
    sendBtn: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: '#111',
        alignItems: 'center', justifyContent: 'center'
    },

    // ===================== SHARED FILES PANEL =====================
    filesPanelContainer: { flex: 1, backgroundColor: 'white' },
    filesPanelHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
    },
    filesPanelTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
    filesPanelClose: {
        width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center'
    },

    emptyFiles: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyFilesIcon: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6',
        alignItems: 'center', justifyContent: 'center', marginBottom: 16
    },
    emptyFilesTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 6 },
    emptyFilesSub: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },

    sharedFileItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#f9fafb'
    },
    sharedFileThumb: { width: 48, height: 48, borderRadius: 10 },
    sharedFileIcon: { backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
    sharedFileName: { fontSize: 14, fontWeight: '600', color: '#111' },
    sharedFileDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
    sharedFileDownload: {
        width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff',
        alignItems: 'center', justifyContent: 'center'
    },
});