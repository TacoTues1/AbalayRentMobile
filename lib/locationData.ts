import { Country, State } from "country-state-city";

export type CountryOption = {
  name: string;
  isoCode: string;
};

export type StateOption = {
  name: string;
  isoCode: string;
};

const COUNTRY_OPTIONS: CountryOption[] = Country.getAllCountries()
  .map((country) => ({
    name: country.name,
    isoCode: country.isoCode,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const normalize = (value: string) => value.trim().toLowerCase();

export const getCountryOptions = () => COUNTRY_OPTIONS;

export const getCountryByName = (countryName: string) => {
  const target = normalize(countryName);
  if (!target) return null;

  return (
    COUNTRY_OPTIONS.find(
      (country) =>
        normalize(country.name) === target ||
        normalize(country.isoCode) === target,
    ) || null
  );
};

export const getStateOptionsForCountry = (
  countryName: string,
): StateOption[] => {
  const country = getCountryByName(countryName);
  if (!country) return [];

  return State.getStatesOfCountry(country.isoCode)
    .map((state) => ({
      name: state.name,
      isoCode: state.isoCode,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
