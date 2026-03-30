import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { KeyboardTypeOptions, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface AuthInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  isPassword?: boolean;
  showPassword?: boolean;
  togglePassword?: () => void;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
}

export default function AuthInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  isPassword,
  showPassword,
  togglePassword,
  keyboardType,
  maxLength,
}: AuthInputProps) {
  return (
    <View style={[styles.container, !label && { marginBottom: 0, flex: 1 }]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputContainer, !label && { borderRadius: label ? 8 : 0 }]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#999"
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          keyboardType={keyboardType}
          maxLength={maxLength}
        />
        {isPassword && (
          <TouchableOpacity onPress={togglePassword} style={styles.icon}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="gray" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 5, color: '#333' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff' },
  input: { flex: 1, padding: 12, fontSize: 16, color: '#000' },
  icon: { padding: 10 },
});