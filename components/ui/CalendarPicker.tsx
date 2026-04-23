import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CalendarPickerProps {
    selectedDate: string;
    onDateSelect: (date: string) => void;
    allowPastDates?: boolean;
    isDark?: boolean;
    themeColors?: { card?: string; border?: string; text?: string; textMuted?: string; background?: string };
}

export default function CalendarPicker({ selectedDate, onDateSelect, allowPastDates = false, isDark = false, themeColors }: CalendarPickerProps) {
    const [currentDate, setCurrentDate] = useState(selectedDate ? new Date(selectedDate) : new Date());
    const [view, setView] = useState<'calendar' | 'month' | 'year'>('calendar');

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

    const selectMonth = (m: number) => {
        const newDate = new Date(year, m, 1);
        setCurrentDate(newDate);
        setView('calendar');
    };

    const selectYear = (y: number) => {
        const newDate = new Date(y, month, 1);
        setCurrentDate(newDate);
        setView('calendar');
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
                        isSelected && [styles.selectedDay, isDark && { backgroundColor: '#fff' }]
                    ]}
                    onPress={() => handleDayPress(day)}
                >
                    <Text style={[
                        styles.dayText,
                        isDark && { color: themeColors?.text || '#fff' },
                        isDisabled && [styles.disabledDayText, isDark && { color: themeColors?.textMuted || '#555' }],
                        isToday && styles.todayText,
                        isSelected && [styles.selectedDayText, isDark && { color: '#000' }]
                    ]}>
                        {day}
                    </Text>
                </TouchableOpacity>
            );
        }

        return days;
    };

    const renderMonthPicker = () => {
        return (
            <View style={styles.gridPicker}>
                {monthNames.map((m, index) => (
                    <TouchableOpacity
                        key={m}
                        style={[
                            styles.gridPickerItem,
                            month === index && styles.selectedGridItem,
                        ]}
                        onPress={() => selectMonth(index)}
                    >
                        <Text style={[
                            styles.gridItemText,
                            isDark && { color: themeColors?.text || '#fff' },
                            month === index && styles.selectedGridItemText
                        ]}>
                            {m.substring(0, 3)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    const renderYearPicker = () => {
        const startYear = 1920;
        const endYear = new Date().getFullYear();
        const years = [];
        for (let y = endYear; y >= startYear; y--) {
            years.push(y);
        }

        return (
            <View style={styles.gridPicker}>
                <View style={{ height: 200, width: '100%' }}>
                    <ScrollView contentContainerStyle={styles.yearList}>
                        {years.map(y => (
                            <TouchableOpacity
                                key={y}
                                style={[
                                    styles.yearItem,
                                    year === y && styles.selectedGridItem,
                                ]}
                                onPress={() => selectYear(y)}
                            >
                                <Text style={[
                                    styles.yearItemText,
                                    isDark && { color: themeColors?.text || '#fff' },
                                    year === y && styles.selectedGridItemText
                                ]}>
                                    {y}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, isDark && { backgroundColor: themeColors?.card || '#1f2937', borderColor: themeColors?.border || '#374151' }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => view === 'calendar' ? changeMonth(-1) : setView('calendar')} 
                    style={styles.navBtn}
                >
                    <Ionicons 
                        name={view === 'calendar' ? "chevron-back" : "close-outline"} 
                        size={20} 
                        color={isDark ? (themeColors?.text || '#fff') : '#333'} 
                    />
                </TouchableOpacity>
                
                <View style={styles.headerSelectors}>
                    <TouchableOpacity 
                        onPress={() => setView(view === 'month' ? 'calendar' : 'month')}
                        style={[
                            styles.selectorBtn,
                            isDark && { backgroundColor: '#374151' },
                            view === 'month' && styles.activeSelector
                        ]}
                    >
                        <Text style={[
                            styles.monthTitle, 
                            isDark && { color: themeColors?.text || '#fff' },
                            view === 'month' && { color: 'white' }
                        ]}>
                            {monthNames[month]}
                        </Text>
                        <Ionicons 
                            name="chevron-down" 
                            size={12} 
                            color={view === 'month' ? 'white' : (isDark ? '#888' : '#666')} 
                            style={{ marginLeft: 4 }}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        onPress={() => setView(view === 'year' ? 'calendar' : 'year')}
                        style={[
                            styles.selectorBtn,
                            isDark && { backgroundColor: '#374151' },
                            view === 'year' && styles.activeSelector
                        ]}
                    >
                        <Text style={[
                            styles.monthTitle, 
                            isDark && { color: themeColors?.text || '#fff' },
                            view === 'year' && { color: 'white' }
                        ]}>
                            {year}
                        </Text>
                        <Ionicons 
                            name="chevron-down" 
                            size={12} 
                            color={view === 'year' ? 'white' : (isDark ? '#888' : '#666')} 
                            style={{ marginLeft: 4 }}
                        />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity 
                    onPress={() => view === 'calendar' ? changeMonth(1) : setView('calendar')} 
                    style={styles.navBtn}
                    disabled={view !== 'calendar'}
                >
                    <Ionicons 
                        name={view === 'calendar' ? "chevron-forward" : undefined} 
                        size={20} 
                        color={isDark ? (themeColors?.text || '#fff') : '#333'} 
                    />
                </TouchableOpacity>
            </View>

            {view === 'calendar' && (
                <>
                    {/* Week Days */}
                    <View style={styles.weekRow}>
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                            <Text key={d} style={[styles.weekDayText, isDark && { color: themeColors?.textMuted || '#888' }]}>{d}</Text>
                        ))}
                    </View>

                    {/* Days Grid */}
                    <View style={styles.daysGrid}>
                        {renderDays()}
                    </View>
                </>
            )}

            {view === 'month' && renderMonthPicker()}
            {view === 'year' && renderYearPicker()}
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
        fontWeight: '700',
        color: '#111',
    },
    headerSelectors: {
        flexDirection: 'row',
        gap: 8,
    },
    selectorBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    activeSelector: {
        backgroundColor: '#2563eb',
    },
    navBtn: {
        padding: 5,
        width: 35,
        alignItems: 'center',
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
    gridPicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        paddingVertical: 10,
    },
    gridPickerItem: {
        width: '30%',
        paddingVertical: 15,
        alignItems: 'center',
        marginVertical: 5,
        borderRadius: 8,
    },
    selectedGridItem: {
        backgroundColor: '#2563eb',
    },
    gridItemText: {
        fontSize: 14,
        fontWeight: '600',
    },
    selectedGridItemText: {
        color: 'white',
    },
    yearList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
    },
    yearItem: {
        width: '23%',
        paddingVertical: 10,
        alignItems: 'center',
        marginVertical: 2,
        borderRadius: 8,
    },
    yearItemText: {
        fontSize: 14,
        fontWeight: '500',
    },
});
