import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native-css/components';

// ---------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-brand active:opacity-80',
  secondary:
    'border border-neutral-300 active:opacity-70 dark:border-neutral-700',
  danger: 'border border-red-300 active:opacity-70 dark:border-red-900',
  success: 'bg-green-600 active:opacity-80',
};

const BUTTON_TEXT_CLASS: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-black dark:text-white',
  danger: 'text-red-600 dark:text-red-400',
  success: 'text-white',
};

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      className={`items-center rounded-xl px-4 py-3 ${BUTTON_CLASS[variant]} ${inactive ? 'opacity-40' : ''}`}
      disabled={inactive}
      onPress={onPress}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'success' ? '#ffffff' : undefined} />
      ) : (
        <Text className={`text-base font-semibold ${BUTTON_TEXT_CLASS[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- Badge

type Tone = 'neutral' | 'info' | 'warn' | 'success' | 'danger';

const BADGE_CLASS: Record<Tone, string> = {
  neutral: 'bg-neutral-100 dark:bg-neutral-800',
  info: 'bg-blue-100 dark:bg-blue-950',
  warn: 'bg-amber-100 dark:bg-amber-950',
  success: 'bg-green-100 dark:bg-green-950',
  danger: 'bg-red-100 dark:bg-red-950',
};

const BADGE_TEXT_CLASS: Record<Tone, string> = {
  neutral: 'text-neutral-600 dark:text-neutral-300',
  info: 'text-blue-700 dark:text-blue-300',
  warn: 'text-amber-700 dark:text-amber-300',
  success: 'text-green-700 dark:text-green-300',
  danger: 'text-red-700 dark:text-red-300',
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${BADGE_CLASS[tone]}`}>
      <Text className={`text-xs font-semibold ${BADGE_TEXT_CLASS[tone]}`}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- SectionCard

export function SectionCard({
  children,
  onPress,
}: PropsWithChildren<{ onPress?: () => void }>) {
  const className = 'gap-2 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800';
  if (onPress) {
    return (
      <Pressable className={`${className} active:opacity-70`} onPress={onPress}>
        {children}
      </Pressable>
    );
  }
  return <View className={className}>{children}</View>;
}

// ---------------------------------------------------------------- Field (display)

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View className="gap-0.5">
      <Text className="text-xs font-semibold uppercase text-neutral-400">{label}</Text>
      {typeof value === 'string' ? (
        <Text className="text-base text-black dark:text-white">{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

// ---------------------------------------------------------------- LabeledInput (form)

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  multiline,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-black dark:text-white">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>
      <TextInput
        className={`rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white ${multiline ? 'h-24' : ''}`}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ---------------------------------------------------------------- GuidanceNote (Keterangan Card)

export function GuidanceNote({ title, body }: { title: string; body: string }) {
  return (
    <View className="gap-1 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
      <Text className="text-sm font-semibold text-blue-800 dark:text-blue-300">{title}</Text>
      <Text className="text-sm text-blue-700 dark:text-blue-300/80">{body}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- EmptyState

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View className="items-center gap-1 rounded-2xl border border-dashed border-neutral-300 p-8 dark:border-neutral-700">
      <Text className="text-center text-base font-semibold text-neutral-600 dark:text-neutral-300">
        {title}
      </Text>
      <Text className="text-center text-sm text-neutral-500 dark:text-neutral-400">{description}</Text>
    </View>
  );
}
