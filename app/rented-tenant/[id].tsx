import { Redirect, useLocalSearchParams } from "expo-router";

export default function LegacyRentedTenantRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  if (!id) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Redirect
      href={{
        pathname: "/(tabs)/rented-tenant/[id]",
        params: { id },
      }}
    />
  );
}
