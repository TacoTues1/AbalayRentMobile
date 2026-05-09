import AsyncStorage from "@react-native-async-storage/async-storage";

const DISMISSED_REVIEWS_STORAGE_KEY = "dismissedReviews";

const normalizeReviewId = (id: unknown) => {
  if (id === null || id === undefined) return "";
  return String(id).trim();
};

export const getDismissedReviewIds = async () => {
  const storedValue = await AsyncStorage.getItem(DISMISSED_REVIEWS_STORAGE_KEY);
  if (!storedValue) return [];

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(storedValue);
  } catch {
    return [];
  }
  if (!Array.isArray(parsedValue)) return [];

  return parsedValue.map(normalizeReviewId).filter(Boolean);
};

export const addDismissedReviewId = async (id: unknown) => {
  const reviewId = normalizeReviewId(id);
  if (!reviewId) return;

  const dismissedIds = await getDismissedReviewIds();
  if (dismissedIds.includes(reviewId)) return;

  await AsyncStorage.setItem(
    DISMISSED_REVIEWS_STORAGE_KEY,
    JSON.stringify([...dismissedIds, reviewId]),
  );
};
