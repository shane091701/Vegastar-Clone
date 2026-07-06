ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

# minitest 6 extracted minitest/mock into a separate gem; provide the small
# Object#stub used by our tests when it isn't available.
begin
  require "minitest/mock"
rescue LoadError
  class Object
    def stub(name, val_or_callable, *block_args, **block_kwargs)
      new_name = "__stubbed__#{name}"
      metaclass = class << self; self; end
      metaclass.send :alias_method, new_name, name
      metaclass.send :define_method, name do |*args, **kwargs, &blk|
        if val_or_callable.respond_to?(:call)
          val_or_callable.call(*args, **kwargs, &blk)
        else
          blk&.call(*block_args, **block_kwargs)
          val_or_callable
        end
      end
      yield self
    ensure
      metaclass.send :undef_method, name
      metaclass.send :alias_method, name, new_name
      metaclass.send :undef_method, new_name
    end
  end
end

module ActiveSupport
  class TestCase
    # Threaded parallel tests corrupt pg's native connection on Windows
    # (PQsendQuery "another command is already in progress", 0xC0000374)
    parallelize(workers: 1)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
  end
end
