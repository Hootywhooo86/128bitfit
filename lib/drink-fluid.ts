/**
 * How much water a logged food adds, when it is a drink with a stated volume.
 *
 * Worked out from the day's food logs when the day is read, not written as
 * separate water rows when food is logged: a row written once goes stale the
 * moment the food is edited or deleted, and "count drinks as water" would then
 * be counting a drink that no longer exists.
 *
 * Never estimated (CLAUDE.md #5). A serving in grams is a weight, not a
 * volume, so a drink logged by weight is reported as unmeasured rather than
 * converted with an assumed density.
 */

const VOLUME_UNITS: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  'fl oz': 29.5735,
  'fl. oz': 29.5735,
  'fl oz.': 29.5735,
  floz: 29.5735,
  'fluid ounce': 29.5735,
  'fluid ounces': 29.5735,
};

/** Kitchen volumes that are used for solids too (a cup of rice), so they only count for a drink. */
const KITCHEN_UNITS: Record<string, number> = {
  cup: 236.588,
  cups: 236.588,
  pint: 473.176,
  pints: 473.176,
  quart: 946.353,
  quarts: 946.353,
  gallon: 3785.41,
  gallons: 3785.41,
};

// Whole words only: "tea" must not match "steak", nor "water" "watermelon".
const DRINK_WORDS =
  /\b(water|juice|tea|coffee|espresso|latte|cappuccino|soda|cola|lemonade|milk|beer|lager|ale|cider|wine|smoothie|shake|kombucha|drink|beverage)\b/i;
// Things named after a drink that are not one.
const NOT_DRINKS =
  /\b(chocolate|powder|powdered|bar|cereal|cake|cookie|biscuit|bread|candy|ice cream|cheese|yogurt|yoghurt|dry|dried|mix|leaves|beans|ground|chestnuts?|melon|packed in|canned in|drained)\b/i;

export function looksLikeDrink(name: string): boolean {
  return DRINK_WORDS.test(name) && !NOT_DRINKS.test(name);
}

export type DrinkFluid =
  | { status: 'counted'; ml: number }
  /** A drink, but its serving is not a volume — said, not guessed. */
  | { status: 'unmeasured' }
  | { status: 'not-a-drink' };

export function drinkFluid(log: {
  name: string;
  servingSize: number | null;
  servingUnit: string | null;
  servings: number;
}): DrinkFluid {
  const unit = log.servingUnit?.trim().toLowerCase() ?? '';
  const size = log.servingSize;
  const drink = looksLikeDrink(log.name);

  // A serving stated in ml or fl oz is liquid by definition — soup and all.
  const volume = VOLUME_UNITS[unit] ?? (drink ? KITCHEN_UNITS[unit] : undefined);
  if (volume != null && size != null && size > 0 && log.servings > 0) {
    return { status: 'counted', ml: Math.round(size * volume * log.servings) };
  }
  return drink ? { status: 'unmeasured' } : { status: 'not-a-drink' };
}
