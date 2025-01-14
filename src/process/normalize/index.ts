import get from 'lodash/get';
import set from 'lodash/set';
import isString from 'lodash/isString';
import toString from 'lodash/toString';
import isNil from 'lodash/isNil';
import isObject from 'lodash/isObject';
import {
    AddressComponent,
    DayComponent,
    EmailComponent,
    ProcessorFnSync,
    ProcessorFn,
    RadioComponent,
    RecaptchaComponent,
    SelectComponent,
    SelectBoxesComponent,
    TagsComponent,
    TextFieldComponent,
    DefaultValueScope,
    ProcessorInfo,
    ProcessorContext
} from "types";

type NormalizeScope = DefaultValueScope;

const isAddressComponent = (component: any): component is AddressComponent => component.type === "address";
const isDayComponent = (component: any): component is DayComponent => component.type === "day";
const isEmailComponent = (component:any): component is EmailComponent => component.type === "email";
const isRadioComponent = (component: any): component is RadioComponent => component.type === "radio";
const isRecaptchaComponent = (component: any): component is RecaptchaComponent => component.type === "recaptcha";
const isSelectComponent = (component: any): component is SelectComponent => component.type === "select";
const isSelectBoxesComponent = (component: any): component is SelectBoxesComponent => component.type === "selectboxes";
const isTagsComponent = (component: any): component is TagsComponent => component.type === "tags";
const isTextFieldComponent = (component: any): component is TextFieldComponent => component.type === "textfield";

const normalizeAddressComponentValue = (component: AddressComponent, value: any) => {
    if (!component.multiple && Boolean(component.enableManualMode) && value && value.mode) {
        return {
          mode: 'autocomplete',
          address: value,
        }
    }
    return value;
}

const getLocaleDateFormatInfo = (locale: string = 'en') => {
    const formatInfo: {dayFirst?: boolean} = {};

    const day = 21;
    const exampleDate = new Date(2017, 11, day);
    const localDateString = exampleDate.toLocaleDateString(locale);

    formatInfo.dayFirst = localDateString.slice(0, 2) === day.toString();

    return formatInfo;
};

const getLocaleDayFirst = (component: DayComponent, form: any) => {
    if (component.useLocaleSettings) {
        return getLocaleDateFormatInfo(form.options?.language).dayFirst;
    }
    return component.dayFirst;
};

const normalizeDayComponentValue = (component: DayComponent, form: any, value: any) => {
    // TODO: this is a quick and dirty port of the Day component's normalizeValue method, may need some updates
    const valueMask = /^\d{2}\/\d{2}\/\d{4}$/;

    const isDayFirst = getLocaleDayFirst(component, form);
    const showDay = !get(component, 'fields.day.hide', false);
    const showMonth = !get(component, 'fields.month.hide', false);
    const showYear = !get(component, 'fields.year.hide', false);

    if (!value || valueMask.test(value)) {
        return value;
    }
    let dateParts: string[] = [];
    const valueParts = value.split('/');
    const [DAY, MONTH, YEAR] = component.dayFirst ? [0, 1, 2] : [1, 0, 2];
    const defaultValue = component.defaultValue ? component.defaultValue.split('/') : '';

    const getNextPart = (shouldTake: boolean, defaultValue: string) =>
        dateParts.push(shouldTake ? valueParts.shift() : defaultValue);

    if (isDayFirst) {
        getNextPart(showDay, defaultValue ? defaultValue[DAY] : '00');
    }

    getNextPart(showMonth, defaultValue ? defaultValue[MONTH] : '00');

    if (!isDayFirst) {
        getNextPart(showDay, defaultValue ? defaultValue[DAY] : '00');
    }

    getNextPart(showYear, defaultValue ? defaultValue[YEAR] : '0000');

    return dateParts.join('/');
};

const normalizeRadioComponentValue = (value: any) => {
    const isEquivalent = toString(value) === Number(value).toString();
    if (!isNaN(parseFloat(value)) && isFinite(value) && isEquivalent) {
        return +value;
    }

    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
       return false;
    }

    return value;
};

const normalizeSingleSelectComponentValue = (component: SelectComponent, value: any) => {
    if (isNil(value)) {
        return;
    }
    const valueIsObject = isObject(value);
    //check if value equals to default emptyValue
    if (valueIsObject && Object.keys(value).length === 0) {
        return value;
    }

    const dataType = component.dataType || 'auto';
    const normalize = {
        value,
        number() {
            const numberValue = Number(this.value);
            const isEquivalent = value.toString() === numberValue.toString();

            if (!Number.isNaN(numberValue) && Number.isFinite(numberValue) && value !== '' && isEquivalent) {
                this.value = numberValue;
            }

            return this;
        },

        boolean() {
            if (isString(this.value) && (this.value.toLowerCase() === 'true' || this.value.toLowerCase() === 'false')) {
                this.value = (this.value.toLowerCase() === 'true');
            }
            return this;
        },

        string() {
            this.value = String(this.value);
            return this;
        },

        object() {
            return this;
        },

        auto() {
            if (isObject(this.value)) {
                this.value = this.object().value;
            }
            else {
                this.value = this.string().number().boolean().value;
            }
            return this;
        }
    };

    try {
        return normalize[dataType]().value;
    }
    catch (err) {
        console.warn('Failed to normalize value', err);
        return value;
    }
}

const normalizeSelectComponentValue = (component: SelectComponent, value: any) => {
    if (component.multiple && Array.isArray(value)) {
        return value.map((singleValue) => normalizeSingleSelectComponentValue(component, singleValue));
    }

    return normalizeSingleSelectComponentValue(component, value);
};

const normalizeSelectBoxesComponentValue = (value: any) => {
    if (typeof value !== 'object') {
        if (typeof value === 'string') {
            return {
                [value]: true
            };
        }
        else {
            return {};
        }
    }
    if (Array.isArray(value)) {
        return value.reduce((acc, curr) => {
            return { ...acc, [curr]: true };
        }, {});
    }

    return value;
};

const normalizeTagsComponentValue = (component: TagsComponent, value: any) => {
    const delimiter = component.delimeter || ',';
    if (component.storeas === 'string' && Array.isArray(value)) {
        return value.join(delimiter);
    }
    else if (component.storeas === 'array' && typeof value === 'string') {
        return value.split(delimiter).filter(result => result);
    }
    return value;
};

const normalizeMaskValue = (
    component: TextFieldComponent,
    defaultValues: DefaultValueScope['defaultValues'],
    value: any
) => {
    if (component.inputMasks && component.inputMasks.length > 0) {
        if (!value || typeof value !== 'object') {
            return {
                val: value,
                maskName: component.inputMasks[0].label
            }
        }
        if (!value.value) {
            const defaultValue = defaultValues?.find((defaultValue) => defaultValue.path === component.path);
            value.value = Array.isArray(defaultValue) && defaultValue.length > 0 ? defaultValue[0] : defaultValue;
        }
    }
    return value;
}

const normalizeTextFieldComponentValue = (
    component: TextFieldComponent,
    defaultValues: DefaultValueScope['defaultValues'],
    value: any
) => {
    if (component.allowMultipleMasks && component.inputMasks && component.inputMasks.length > 0) {
        if (Array.isArray(value)) {
            return value.map((val) => normalizeMaskValue(component, defaultValues, val));
        } else {
            return normalizeMaskValue(component, defaultValues, value);
        }
    }
    return value;
}

export const normalizeProcess: ProcessorFn<NormalizeScope> = async (context) => {
    return normalizeProcessSync(context);
}

export const normalizeProcessSync: ProcessorFnSync<NormalizeScope> = (context) => {
    const { component, form, scope, path, data, value } = context;
    let { defaultValues } = scope;
    // First check for component-type-specific transformations
    if (isAddressComponent(component)) {
        set(data, path, normalizeAddressComponentValue(component, value));
    } else if (isDayComponent(component)) {
        set(data, path, normalizeDayComponentValue(component, form, value));
    } else if (isEmailComponent(component)) {
        if (value && typeof value === 'string') {
            set(data, path, value.toLowerCase());
        }
    } else if (isRadioComponent(component)) {
        set(data, path, normalizeRadioComponentValue(value));
    } else if (isSelectComponent(component)) {
        set(data, path, normalizeSelectComponentValue(component, value));
    } else if (isSelectBoxesComponent(component)) {
        set(data, path, normalizeSelectBoxesComponentValue(value));
    } else if (isTagsComponent(component)) {
        set(data, path, normalizeTagsComponentValue(component, value));
    } else if (isTextFieldComponent(component)) {
       set(data, path, normalizeTextFieldComponentValue(component, defaultValues, value));
    }

    // Next perform component-type-agnostic transformations (i.e. super())
    if (component.multiple && !Array.isArray(value)) {
        set(data, path, value ? [value] : []);
    }
};

export const normalizeProcessInfo: ProcessorInfo<ProcessorContext<NormalizeScope>, void> = {
    name: 'normalize',
    shouldProcess: () => true,
    process: normalizeProcess,
    processSync: normalizeProcessSync
}
