import React from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";

type BlockingLoaderProps = {
  visible: boolean;
  message: string;
  isDark?: boolean;
  surfaceColor?: string;
  textColor?: string;
  borderColor?: string;
};

export default function BlockingLoader({
  visible,
  message,
  isDark = false,
  surfaceColor,
  textColor,
  borderColor,
}: BlockingLoaderProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: surfaceColor || (isDark ? "#111827" : "white"),
              borderColor: borderColor || (isDark ? "#374151" : "#e5e7eb"),
            },
          ]}
        >
          <ActivityIndicator
            size="large"
            color={textColor || (isDark ? "#f9fafb" : "#111")}
          />
          <Text
            style={[
              styles.message,
              { color: textColor || (isDark ? "#f9fafb" : "#111") },
            ]}
          >
            {message}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  message: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
});
