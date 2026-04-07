import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

describe('Vitest smoke test', () => {
  it('should run a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should mount a simple Vue component', async () => {
    const TestComponent = defineComponent({
      template: '<div>{{ message }}</div>',
      setup() {
        const message = ref('Hello Vitest');
        return { message };
      },
    });

    const wrapper = mount(TestComponent);
    expect(wrapper.text()).toBe('Hello Vitest');
  });

  it('should have a working localStorage mock', () => {
    localStorage.setItem('test-key', 'test-value');
    expect(localStorage.getItem('test-key')).toBe('test-value');
    localStorage.removeItem('test-key');
    expect(localStorage.getItem('test-key')).toBeNull();
  });
});
