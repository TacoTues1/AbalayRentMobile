import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CalendarPickerProps {
    selectedDate: string;
    onDateSelect: (date: string) => void;
    allowPastDates?: boolean;
}

export default function CalendarPicker({ selectedDate, onDateSelect, allowPastDates = false }: CalendarPickerProps) {
    const [currentDate, setCurrentDate] = useState(selectedDate ? new Date(selectedDate) : new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const changeMonth = (delta: number) => {
        const newDate = new Date(year, month + delta, 1);
        setCurrentDate(newDate);
    };

    const handleDayPress = (day: number) => {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        onDateSelect(dateString);
    };

    const renderDays = () => {
        const days = [];
        // Empty slots for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cellDate = new Date(year, month, day);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize today to midnight

            const isSelected = selectedDate === dateString;
            const isToday = cellDate.toDateString() === today.toDateString();
            const isPast = cellDate < today;
            const isDisabled = !allowPastDates && isPast;

            days.push(
                <TouchableOpacity
                    key={day}
                    disabled={isDisabled}
                    style={[
                        styles.dayCell,
                        isSelected && styles.selectedDay
                    ]}
                    onPress={() => handleDayPress(day)}
                >
                    <Text style={[
                        styles.dayText,
                        isDisabled && styles.disabledDayText,
                        isToday && styles.todayText,
                        isSelected && styles.selectedDayText
                    ]}>
                        {day}
                    </Text>
                </TouchableOpacity>
            );
        }

        return days;
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
                    <Ionicons name="chevron-back" size={20} color="#333" />
                </TouchableOpacity>
                <Text style={styles.monthTitle}>{monthNames[month]} {year}</Text>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
                    <Ionicons name="chevron-forward" size={20} color="#333" />
                </TouchableOpacity>
            </View>

            {/* Week Days */}
            <View style={styles.weekRow}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <Text key={d} style={styles.weekDayText}>{d}</Text>
                ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
                {renderDays()}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: '#eee',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    monthTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#111',
    },
    navBtn: {
        padding: 5,
    },
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
    },
    weekDayText: {
        width: '14.28%',
        textAlign: 'center',
        fontSize: 10,
        fontWeight: 'bold',
        color: '#9ca3af',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%', // 100% / 7
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
    },
    dayText: {
        fontSize: 12,
        color: '#111',
    },
    todayText: {
        color: '#2563eb',
        fontWeight: 'bold',
    },
    selectedDay: {
        backgroundColor: '#111',
    },
    selectedDayText: {
        color: 'white',
        fontWeight: 'bold',
    },
    disabledDayText: {
        color: '#d1d5db', // Light gray for disabled days
    },
});
